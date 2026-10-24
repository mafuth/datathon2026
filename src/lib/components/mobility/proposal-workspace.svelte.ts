import { base } from '$app/paths';

import type { IslandServicesResponse, ServiceDemandCategory } from './island-services';
import type { ProposalCosts, ProposalSettings } from '$lib/mobility/proposal-planning';
import type { ProposalTransportOptions } from '$lib/mobility/proposal-transport';
import type { ScenarioOperation, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';

import { DEFAULT_PROPOSAL_SETTINGS, proposalAllowance } from '$lib/mobility/proposal-planning';
import { snapToProposalBusRoute } from '$lib/mobility/proposal-transport';

import { pointWithinGeometryGrace } from './island-geometry';

type Coordinate = [number, number];
type StagedChange = {
  operations: ScenarioOperation[];
  label: string;
  coordinates: Coordinate;
  preview: ScenarioPreviewResponse | null;
  error: string | null;
  suggestions: boolean;
};

export type ProposalSuggestion = {
  id: string;
  label: string;
  description: string;
  capital: number;
  annual: number;
};

export function newProposalOperationId(): string {
  return crypto.randomUUID();
}

export function withoutProposalOperation(operations: readonly ScenarioOperation[], id: string): ScenarioOperation[] {
  const removed = operations.find((operation) => operation.operationId === id);
  if (!removed) return [...operations];
  const removedServiceId = removed.kind === 'add_service' ? `draft:${id}` : null;
  return operations.filter(
    (operation) =>
      operation.operationId !== id &&
      !(removedServiceId && 'serviceId' in operation && operation.serviceId === removedServiceId)
  );
}

export class ProposalWorkspace {
  baseline = $state.raw<IslandServicesResponse | null>(null);
  accepted = $state.raw<ScenarioPreviewResponse | null>(null);
  operations = $state.raw<ScenarioOperation[]>([]);
  settings = $state<ProposalSettings>({ ...DEFAULT_PROPOSAL_SETTINGS });
  comparisonView = $state<'before' | 'after'>('after');
  comparisonLens = $state<ServiceDemandCategory>('transport');
  pending = $state(false);
  error = $state<string | null>(null);
  message = $state<string | null>(null);
  current = $state(false);
  exporting = $state(false);
  exportError = $state<string | null>(null);
  staged = $state.raw<StagedChange | null>(null);
  suggestions = $state.raw<ProposalSuggestion[]>([]);
  history = $state.raw<ScenarioOperation[][]>([]);
  transportOptions = $state.raw<ProposalTransportOptions | null>(null);
  transportOptionsLoading = $state(false);
  transportOptionsError = $state<string | null>(null);
  private transportOptionsToken = 0;
  private transportOptionsController: AbortController | null = null;
  private transportOptionsRequest: { key: string; promise: Promise<void> } | null = null;
  private requestToken = 0;
  private requestController: AbortController | null = null;
  private activeEvaluation: { key: string; kind: 'accepted' | 'staged'; promise: Promise<void> } | null = null;
  private settingsRevision = 0;
  private exportController: AbortController | null = null;

  get costs(): ProposalCosts | null {
    return this.accepted?.costs ?? null;
  }
  get impact() {
    return this.accepted?.impact ?? null;
  }
  private quoteMatchesSettings(preview: ScenarioPreviewResponse | null | undefined): boolean {
    return (
      !!preview &&
      preview.baselineVersion === this.baseline?.baselineVersion &&
      preview.selectedIslandId === this.baseline?.island.id &&
      preview.proposal.name === this.settings.name &&
      preview.proposal.capitalLimit === this.settings.capitalLimit &&
      preview.proposal.annualLimit === this.settings.annualLimit
    );
  }
  get display(): IslandServicesResponse | null {
    if (this.comparisonView === 'before') return this.baseline;
    const candidate = this.staged?.preview;
    return candidate?.costs.withinBudget && this.quoteMatchesSettings(candidate)
      ? candidate
      : (this.accepted ?? this.baseline);
  }
  get pendingPlacement() {
    if (!this.staged || this.staged.suggestions) return null;
    return {
      label: this.staged.label,
      coordinates: this.staged.coordinates,
      costs: this.staged.preview?.costs ?? null,
      checking: this.pending,
      error: this.staged.error,
      allowed:
        !this.pending &&
        this.staged.preview?.costs.withinBudget === true &&
        this.quoteMatchesSettings(this.staged.preview)
    };
  }
  get reviewCurrent(): boolean {
    return this.current && !this.pending && !this.staged && this.quoteMatchesSettings(this.accepted);
  }
  get suggestionsAllowed(): boolean {
    return (
      !this.pending &&
      this.staged?.suggestions === true &&
      this.staged.preview?.costs.withinBudget === true &&
      this.quoteMatchesSettings(this.staged.preview)
    );
  }

  async open(baseline: IslandServicesResponse): Promise<void> {
    if (
      this.baseline?.island.id !== baseline.island.id ||
      this.baseline?.baselineVersion !== baseline.baselineVersion
    ) {
      this.cancelTransportOptions();
      this.cancelExport();
      this.transportOptions = null;
      this.transportOptionsError = null;
    }
    if (this.baseline?.island.id === baseline.island.id && this.baseline.baselineVersion === baseline.baselineVersion) {
      this.baseline = baseline;
      if (this.staged) this.cancel();
      if (this.staged || (this.current && this.quoteMatchesSettings(this.accepted))) return;
      await this.refresh();
      return;
    }
    this.cancelRequest();
    this.baseline = baseline;
    this.accepted = null;
    this.operations = [];
    this.history = [];
    this.staged = null;
    this.suggestions = [];
    this.current = false;
    this.settings = { ...DEFAULT_PROPOSAL_SETTINGS, name: `${baseline.island.name} access proposal` };
    this.error = null;
    this.message = null;
    await this.refresh();
  }

  retryTransportOptions(): Promise<void> {
    return this.baseline
      ? this.loadTransportOptions(this.baseline.island.id, this.baseline.baselineVersion)
      : Promise.resolve();
  }

  private loadTransportOptions(islandId: string, baselineVersion?: string): Promise<void> {
    const key = `${islandId}:${baselineVersion ?? ''}`;
    if (this.transportOptionsRequest?.key === key) return this.transportOptionsRequest.promise;
    this.cancelTransportOptions();
    const token = ++this.transportOptionsToken;
    const controller = new AbortController();
    this.transportOptionsController = controller;
    this.transportOptionsLoading = true;
    this.transportOptionsError = null;
    const promise = (async () => {
      try {
        const response = await fetch(`${base}/api/v1/scenarios/transport-options?islandId=${encodeURIComponent(islandId)}`, {
          cache: 'no-cache',
          signal: controller.signal
        });
        if (controller.signal.aborted || token !== this.transportOptionsToken) return;
        if (!response.ok) throw new Error('Transport options could not be loaded. Please try again.');
        const options = (await response.json()) as ProposalTransportOptions;
        if (options.islandId !== islandId)
          throw new Error('Transport options belong to a different island. Please try again.');
        if (
          token === this.transportOptionsToken &&
          this.baseline?.island.id === islandId &&
          this.baseline.baselineVersion === baselineVersion
        )
          this.transportOptions = options;
      } catch (failure) {
        if (token === this.transportOptionsToken)
          this.transportOptionsError =
            failure instanceof Error ? failure.message : 'Transport options could not be loaded.';
      } finally {
        if (token === this.transportOptionsToken) {
          this.transportOptionsLoading = false;
          this.transportOptionsRequest = null;
          this.transportOptionsController = null;
        }
      }
    })();
    this.transportOptionsRequest = { key, promise };
    return promise;
  }

  private cancelTransportOptions(): void {
    this.transportOptionsToken += 1;
    this.transportOptionsController?.abort();
    this.transportOptionsController = null;
    this.transportOptionsRequest = null;
    this.transportOptionsLoading = false;
  }

  suspend(): void {
    this.cancelRequest();
    this.cancelTransportOptions();
    this.cancelExport();
    this.staged = null;
    this.suggestions = [];
  }

  private cancelExport(): void {
    this.exportController?.abort();
    this.exportController = null;
    this.exporting = false;
    this.exportError = null;
  }

  private body(operations: readonly ScenarioOperation[]) {
    return {
      baselineVersion: this.baseline?.baselineVersion,
      selectedIslandId: this.baseline?.island.id,
      proposal: { ...this.settings },
      operations
    };
  }
  private cancelRequest(): void {
    this.requestToken += 1;
    this.requestController?.abort();
    this.requestController = null;
    this.activeEvaluation = null;
    this.pending = false;
  }
  private async evaluate(body: string, signal: AbortSignal): Promise<ScenarioPreviewResponse> {
    const response = await fetch(`${base}/api/v1/scenarios/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Proposal evaluation is unavailable. Try again.');
    return payload as ScenarioPreviewResponse;
  }

  refresh(nextOperations = this.operations, recordHistory = false): Promise<void> {
    if (!this.baseline?.baselineVersion) return Promise.resolve();
    const body = JSON.stringify(this.body(nextOperations));
    const key = `${recordHistory}:${body}`;
    if (this.activeEvaluation?.kind === 'accepted' && this.activeEvaluation.key === key)
      return this.activeEvaluation.promise;
    this.cancelRequest();
    const token = this.requestToken;
    const controller = new AbortController();
    this.requestController = controller;
    this.pending = true;
    this.current = false;
    this.error = null;
    this.exportError = null;
    const promise = (async () => {
      try {
        const preview = await this.evaluate(body, controller.signal);
        if (token !== this.requestToken) return;
        if (recordHistory) this.history = [...this.history, [...this.operations]];
        this.operations = [...nextOperations];
        this.accepted = preview;
        this.current = true;
      } catch (error) {
        if (token === this.requestToken) this.error = error instanceof Error ? error.message : 'Evaluation failed.';
      } finally {
        if (token === this.requestToken) {
          this.pending = false;
          this.activeEvaluation = null;
          this.requestController = null;
        }
      }
    })();
    this.activeEvaluation = { key, kind: 'accepted', promise };
    return promise;
  }

  async updateSettings(settings: ProposalSettings): Promise<void> {
    if (
      settings.name === this.settings.name &&
      settings.capitalLimit === this.settings.capitalLimit &&
      settings.annualLimit === this.settings.annualLimit &&
      (this.activeEvaluation || (this.current && this.quoteMatchesSettings(this.accepted)))
    ) {
      await this.activeEvaluation?.promise;
      return;
    }
    const revision = ++this.settingsRevision;
    this.settings = { ...settings };
    this.current = false;
    this.cancel();
    await this.refresh();
    if (revision !== this.settingsRevision) return;
  }

  async updatePendingEstimate(estimate: { capital: number; annual: number; basis: string }): Promise<void> {
    if (!this.staged || this.pending || this.staged.suggestions) return;
    const staged = this.staged;
    const last = staged.operations.at(-1);
    if (!last || last.kind === 'add_bus_service' || last.kind === 'add_ferry_service') return;
    const operations = [...staged.operations.slice(0, -1), { ...last, estimate }];
    await this.stageOperations(operations, staged.label, staged.coordinates);
  }

  async stage(operation: ScenarioOperation, label: string, coordinates?: Coordinate): Promise<void> {
    if (!this.baseline?.baselineVersion) return;
    const serviceId = operation.kind === 'move_service' ? operation.serviceId : null;
    const service = serviceId ? this.accepted?.services.find((entry) => entry.id === serviceId) : null;
    if (
      (operation.kind === 'add_service' && operation.subtype === 'bus_stop') ||
      (operation.kind === 'move_service' && service?.subtype === 'bus_stop')
    ) {
      if (!this.transportOptions) {
        this.cancelRequest();
        const token = this.requestToken;
        const islandId = this.baseline?.island.id;
        const baselineVersion = this.baseline?.baselineVersion;
        this.pending = true;
        this.error = null;
        this.exportError = null;
        this.comparisonView = 'after';
        this.suggestions = [];
        // Show the dropped point immediately while lazy route geometry loads.
        // The server quote and any route snapping still run before confirmation.
        this.staged = {
          operations: [...this.operations, operation],
          label,
          coordinates: coordinates ?? operation.coordinates,
          preview: null,
          error: null,
          suggestions: false
        };
        await this.retryTransportOptions();
        if (
          token !== this.requestToken ||
          islandId !== this.baseline?.island.id ||
          baselineVersion !== this.baseline?.baselineVersion
        )
          return;
        this.pending = false;
        if (this.transportOptionsError) {
          this.error = this.transportOptionsError;
          if (this.staged) this.staged = { ...this.staged, error: this.transportOptionsError };
          return;
        }
      }
      const snap = snapToProposalBusRoute(operation.coordinates, this.transportOptions?.busRoutes ?? []);
      if (snap) {
        operation = { ...operation, coordinates: snap.coordinates };
        coordinates = snap.coordinates;
        label = `${label} · snapped ${Math.round(snap.distanceMeters)} m to ${snap.routeName}`;
      }
    }
    await this.stageOperations(
      [...this.operations, operation],
      label,
      coordinates ?? ('coordinates' in operation ? operation.coordinates : (this.baseline?.island.centroid ?? [0, 0]))
    );
  }

  private stageOperations(
    operations: ScenarioOperation[],
    label: string,
    coordinates: Coordinate,
    suggestions = false
  ): Promise<void> {
    if (!this.baseline?.baselineVersion) return Promise.resolve();
    const body = JSON.stringify(this.body(operations));
    if (this.activeEvaluation?.kind === 'staged' && this.activeEvaluation.key === body) {
      if (this.staged) this.staged = { ...this.staged, label, coordinates };
      return this.activeEvaluation.promise;
    }
    this.cancelRequest();
    const token = this.requestToken;
    const controller = new AbortController();
    this.requestController = controller;
    this.pending = true;
    this.error = null;
    this.exportError = null;
    this.comparisonView = 'after';
    if (!suggestions) this.suggestions = [];
    this.staged = { operations, label, coordinates, preview: null, error: null, suggestions };
    const promise = (async () => {
      try {
        const preview = await this.evaluate(body, controller.signal);
        if (token !== this.requestToken || !this.staged) return;
        this.staged = { ...this.staged, preview };
      } catch (error) {
        if (token !== this.requestToken || !this.staged) return;
        const message = error instanceof Error ? error.message : 'Placement could not be checked.';
        this.staged = { ...this.staged, error: message };
        this.error = message;
      } finally {
        if (token === this.requestToken) {
          this.pending = false;
          this.activeEvaluation = null;
          this.requestController = null;
        }
      }
    })();
    this.activeEvaluation = { key: body, kind: 'staged', promise };
    return promise;
  }

  confirm(): boolean {
    if (this.pending || !this.staged?.preview?.costs.withinBudget || !this.quoteMatchesSettings(this.staged.preview))
      return false;
    this.history = [...this.history, [...this.operations]];
    this.operations = [...this.staged.operations];
    this.accepted = this.staged.preview;
    this.message = `${this.staged.label} accepted. Use Undo to reverse this change.`;
    this.staged = null;
    this.suggestions = [];
    this.current = true;
    this.error = null;
    return true;
  }

  cancel(): void {
    this.cancelRequest();
    this.staged = null;
    this.suggestions = [];
    this.error = null;
  }

  async undo(): Promise<void> {
    if (this.pending) return;
    this.cancel();
    const previous = this.history.at(-1) ?? this.operations.slice(0, -1);
    await this.refresh(previous);
    if (this.current) this.history = this.history.slice(0, -1);
  }

  async remove(id: string): Promise<void> {
    if (this.pending) return;
    this.cancel();
    await this.refresh(withoutProposalOperation(this.operations, id), true);
  }

  async suggest(priorities: ServiceDemandCategory[], geometry: unknown): Promise<void> {
    if (!this.baseline || this.pending) return;
    this.cancel();
    const services = this.accepted?.services ?? this.baseline.services;
    let capitalRemaining = this.settings.capitalLimit - (this.costs?.capital ?? 0);
    let annualRemaining = this.settings.annualLimit - (this.costs?.annual ?? 0);
    const operations: ScenarioOperation[] = [];
    const choices: ProposalSuggestion[] = [];
    const centers = this.baseline.hexes.features
      .map((feature) => {
        const ring = feature.geometry.coordinates[0] ?? [];
        const points = ring.slice(0, -1);
        return points.length
          ? ([
              points.reduce((s, p) => s + p[0], 0) / points.length,
              points.reduce((s, p) => s + p[1], 0) / points.length
            ] as Coordinate)
          : null;
      })
      .filter((point): point is Coordinate => point !== null && pointWithinGeometryGrace(point, geometry, 0));
    if (!centers.length && pointWithinGeometryGrace(this.baseline.island.centroid, geometry, 0)) {
      centers.push(this.baseline.island.centroid);
    }
    for (const category of priorities.filter((value, index) => priorities.indexOf(value) === index)) {
      const subtype = category === 'transport' ? 'bus_stop' : category === 'education' ? 'school' : 'hospital';
      const allowance = proposalAllowance(subtype);
      if (!allowance || allowance.capital > capitalRemaining || allowance.annual > annualRemaining || !centers.length)
        continue;
      const sites = services
        .filter((service) => service.serviceType === category && service.coordinates)
        .map((service) => service.coordinates!);
      let coordinates: Coordinate | undefined;
      let furthestDistance = -Infinity;
      for (const center of centers) {
        const longitudeScale = Math.cos((center[1] * Math.PI) / 180);
        let distance = sites.length ? Infinity : 1;
        for (const site of sites) {
          distance = Math.min(distance, Math.hypot((site[0] - center[0]) * longitudeScale, site[1] - center[1]));
          if (distance === 0) break;
        }
        if (distance > furthestDistance) {
          coordinates = center;
          furthestDistance = distance;
        }
      }
      if (!coordinates) continue;
      const id = newProposalOperationId();
      const label =
        subtype === 'bus_stop'
          ? 'Suggested bus stop'
          : subtype === 'school'
            ? 'Suggested school'
            : 'Suggested hospital';
      operations.push({
        kind: 'add_service',
        operationId: id,
        serviceType: category,
        subtype,
        coordinates,
        name: label
      });
      choices.push({
        id,
        label,
        description:
          'Candidate land cell furthest from mapped services of this type. Review the site on the map; this is a siting heuristic, not an optimized access gain.',
        capital: allowance.capital,
        annual: allowance.annual
      });
      capitalRemaining -= allowance.capital;
      annualRemaining -= allowance.annual;
    }
    this.suggestions = choices;
    if (!operations.length) {
      this.error =
        'No supported package fits both remaining budgets and the mapped land. Change your priorities or budgets, or place an improvement manually.';
      return;
    }
    await this.stageOperations(
      [...this.operations, ...operations],
      'Suggested package',
      this.baseline.island.centroid,
      true
    );
    if (this.staged?.preview && !this.staged.preview.costs.withinBudget) {
      this.error = 'The authoritative package estimate exceeds a budget. Adjust the limits before accepting.';
    }
  }

  async downloadPdf(): Promise<void> {
    if (!this.reviewCurrent || !this.costs?.withinBudget || this.exporting) return;
    const controller = new AbortController();
    const requestBody = JSON.stringify(this.body(this.operations));
    const filename = `${
      this.settings.name
        .trim()
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .slice(0, 80) || 'proposal-review'
    }.pdf`;
    this.exportController = controller;
    this.exporting = true;
    this.exportError = null;
    try {
      const response = await fetch(`${base}/api/v1/scenarios/report.pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
        signal: controller.signal
      });
      if (controller.signal.aborted || this.exportController !== controller) return;
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'The proposal PDF could not be generated.');
      }
      const blob = await response.blob();
      if (controller.signal.aborted || this.exportController !== controller) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      if (!controller.signal.aborted && this.exportController === controller)
        this.exportError = error instanceof Error ? error.message : 'PDF export failed.';
    } finally {
      if (this.exportController === controller) {
        this.exportController = null;
        this.exporting = false;
      }
    }
  }
}
