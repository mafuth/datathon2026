import { tick } from 'svelte';

type ValidatableForm = {
  readonly element: HTMLFormElement | null;
  validate: (opts: { preflightOnly: boolean }) => Promise<void>;
  fields: { allIssues(): Array<{ message: string }> | undefined };
};

/**
 * Validates on focusout, then re-validates on input only while errors exist.
 * This clears errors as soon as the user fixes them without creating
 * premature validation noise on pristine or valid fields.
 */
export function useFormValidation(form: ValidatableForm) {
  let hasErrors = $state(false);

  function isLive(element: HTMLFormElement): boolean {
    return element.isConnected && form.element === element;
  }

  async function validate(element: HTMLFormElement) {
    await tick();
    if (!isLive(element)) return;

    try {
      await form.validate({ preflightOnly: true });
    } catch (error) {
      // Remote validation itself yields before reading its form element. Leaving
      // the page during that yield cancels this validation, not the navigation.
      if (!isLive(element)) return;
      throw error;
    }

    if (!isLive(element)) return;
    hasErrors = (form.fields.allIssues() ?? []).length > 0;
  }

  return {
    onfocusout: (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches('input, textarea, select')) return;
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('a[href]')) return;
      const element = form.element;
      if (element?.isConnected) return validate(element);
    },
    oninput: () => {
      if (!hasErrors) return;
      const element = form.element;
      if (element?.isConnected) return validate(element);
    }
  };
}
