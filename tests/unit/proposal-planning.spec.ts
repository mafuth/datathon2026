import { describe, expect, it } from 'vitest';

import { calculateProposalCosts, proposalAllowance } from '../../src/lib/mobility/proposal-planning';
import { SERVICE_CATALOG } from '../../src/lib/mobility/service-catalog';

const settings = { name: 'Allowance coverage', capitalLimit: 1_000_000_000_000, annualLimit: 1_000_000_000_000 };

describe('proposal cost allowance coverage', () => {
  it('provides a priced allowance for every addable service subtype', () => {
    for (const entry of SERVICE_CATALOG) {
      const allowance = proposalAllowance(entry.subtype);
      expect(allowance, entry.subtype).not.toBeNull();
      expect(allowance?.capital, entry.subtype).toBeGreaterThanOrEqual(0);
      expect(allowance?.annual, entry.subtype).toBeGreaterThanOrEqual(0);
    }
  });

  it('calculates complete budgets for every addable service subtype', () => {
    for (const [index, entry] of SERVICE_CATALOG.entries()) {
      const costs = calculateProposalCosts(
        [
          {
            operationId: `add-${entry.subtype}`,
            kind: 'add_service',
            serviceType: entry.serviceType,
            subtype: entry.subtype,
            coordinates: [73 + index / 10_000, 3]
          }
        ],
        [],
        settings
      );
      expect(costs.complete, entry.subtype).toBe(true);
      expect(costs.items[0]?.costAvailable, entry.subtype).toBe(true);
      expect(costs.items[0]?.label, entry.subtype).toBe(entry.label);
    }
  });
});
