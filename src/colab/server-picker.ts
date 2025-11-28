/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { QuickPickItem } from "vscode";
import { InputStep, MultiStepInput } from "../common/multi-step-quickpick";
import { AssignmentManager } from "../jupyter/assignments";
import { ColabServerDescriptor } from "../jupyter/servers";
import { Shape, shapeToRamType, Variant, variantToMachineType } from "./api";

/** Provides an explanation to the user on updating the server alias. */
export const PROMPT_SERVER_ALIAS =
  "Provide a local convenience alias to the server.";

/** Validates the server alias. */
export const validateServerAlias = (value: string) =>
  value.length > 10 ? "Name must be less than 10 characters." : "";

/**
 * Supports prompting the user to pick a Colab server to be created.
 */
export class ServerPicker {
  constructor(
    private readonly vs: typeof vscode,
    private readonly assignments: AssignmentManager,
  ) {}

  /**
   * Prompt the user through a multi-step series of inputs to pick a Colab
   * server type.
   *
   * @param availableServers - The available servers to pick from.
   * @param isHighMemEligible - Whether the user is eligible to select high-mem
   * machines (e.g., Colab Pro users).
   * @returns The selected server, or undefined if the user cancels.
   */
  async prompt(
    availableServers: ColabServerDescriptor[],
    isHighMemEligible: boolean = false,
  ): Promise<ColabServerDescriptor | undefined> {
    const variantToAccelerators = new Map<Variant, Set<string>>();
    for (const server of availableServers) {
      const accelerators =
        variantToAccelerators.get(server.variant) ?? new Set();
      accelerators.add(server.accelerator ?? "NONE");
      variantToAccelerators.set(server.variant, accelerators);
    }
    if (variantToAccelerators.size === 0) {
      return;
    }

    const state: Partial<Server> = {};
    await MultiStepInput.run(this.vs, (input) =>
      this.promptForVariant(
        input,
        state,
        variantToAccelerators,
        isHighMemEligible,
      ),
    );
    if (
      state.variant === undefined ||
      state.accelerator === undefined ||
      !state.alias
    ) {
      return undefined;
    }
    const result: ColabServerDescriptor = {
      label: state.alias,
      variant: state.variant,
      accelerator: state.accelerator,
    };
    if (state.shape !== undefined) {
      return { ...result, shape: state.shape };
    }
    return result;
  }

  private async promptForVariant(
    input: MultiStepInput,
    state: Partial<Server>,
    acceleratorsByVariant: Map<Variant, Set<string>>,
    isHighMemEligible: boolean,
  ): Promise<InputStep | undefined> {
    const items: VariantPick[] = [];
    for (const variant of acceleratorsByVariant.keys()) {
      items.push({
        value: variant,
        label: variantToMachineType(variant),
        // TODO: Add a description for each variant?
      });
    }
    const pick = await input.showQuickPick({
      title: "Select a variant",
      step: 1,
      totalSteps: 2,
      items,
      activeItem: items.find((item) => item.value === state.variant),
      buttons: [input.vs.QuickInputButtons.Back],
    });
    state.variant = pick.value;
    if (!isVariantDefined(state)) {
      return;
    }
    // Skip prompting for an accelerator for the default variant (CPU).
    if (state.variant === Variant.DEFAULT) {
      state.accelerator = "NONE";
      if (isHighMemEligible) {
        return (input: MultiStepInput) =>
          this.promptForShape(input, state, isHighMemEligible);
      }
      return (input: MultiStepInput) =>
        this.promptForAlias(input, state, isHighMemEligible);
    }
    return (input: MultiStepInput) =>
      this.promptForAccelerator(
        input,
        state,
        acceleratorsByVariant,
        isHighMemEligible,
      );
  }

  private async promptForAccelerator(
    input: MultiStepInput,
    state: PartialServerWith<"variant">,
    acceleratorsByVariant: Map<Variant, Set<string>>,
    isHighMemEligible: boolean,
  ): Promise<InputStep | undefined> {
    const accelerators = acceleratorsByVariant.get(state.variant) ?? new Set();
    const items: AcceleratorPick[] = [];
    for (const accelerator of accelerators) {
      items.push({
        value: accelerator,
        label: accelerator,
      });
    }
    const pick = await input.showQuickPick({
      title: "Select an accelerator",
      step: 2,
      // Since we have to pick an accelerator, we've added a step.
      totalSteps: isHighMemEligible ? 4 : 3,
      items,
      activeItem: items.find((item) => item.value === state.accelerator),
      buttons: [input.vs.QuickInputButtons.Back],
    });
    state.accelerator = pick.value;
    if (!isAcceleratorDefined(state)) {
      return;
    }

    if (isHighMemEligible) {
      return (input: MultiStepInput) =>
        this.promptForShape(input, state, isHighMemEligible);
    }
    return (input: MultiStepInput) =>
      this.promptForAlias(input, state, isHighMemEligible);
  }

  private async promptForShape(
    input: MultiStepInput,
    state: PartialServerWith<"variant">,
    isHighMemEligible: boolean,
  ): Promise<InputStep | undefined> {
    const items: ShapePick[] = [
      { value: Shape.STANDARD, label: shapeToRamType(Shape.STANDARD) },
      { value: Shape.HIGHMEM, label: shapeToRamType(Shape.HIGHMEM) },
    ];
    const hasAccelerator = state.accelerator && state.accelerator !== "NONE";
    const step = hasAccelerator ? 3 : 2;
    const pick = await input.showQuickPick({
      title: "Select RAM",
      step,
      totalSteps: step + 1,
      items,
      activeItem: items.find((item) => item.value === state.shape),
      buttons: [input.vs.QuickInputButtons.Back],
    });
    state.shape = pick.value;
    if (state.shape === undefined) {
      return;
    }

    return (input: MultiStepInput) =>
      this.promptForAlias(input, state, isHighMemEligible);
  }

  private async promptForAlias(
    input: MultiStepInput,
    state: PartialServerWith<"variant">,
    isHighMemEligible: boolean,
  ): Promise<InputStep | undefined> {
    const placeholder = await this.assignments.getDefaultLabel(
      state.variant,
      state.accelerator,
    );
    const hasAccelerator = state.accelerator && state.accelerator !== "NONE";
    let step = 2;
    if (hasAccelerator) {
      step = 3;
    }
    if (isHighMemEligible) {
      step = hasAccelerator ? 4 : 3;
    }
    const alias = await input.showInputBox({
      title: "Alias your server",
      step,
      totalSteps: step,
      value: state.alias ?? "",
      prompt: PROMPT_SERVER_ALIAS,
      validate: validateServerAlias,
      placeholder,
      buttons: [input.vs.QuickInputButtons.Back],
    });
    state.alias = alias || placeholder;
    return;
  }
}

interface Server {
  variant: Variant;
  accelerator: string;
  shape?: Shape;
  alias: string;
}

/**
 * A partial of {@link Server} with all properties optional except for K.
 */
type PartialServerWith<K extends keyof Server> = Partial<Server> &
  Required<Pick<Server, K>>;

function isVariantDefined(
  state: Partial<Server>,
): state is PartialServerWith<"variant"> {
  return state.variant !== undefined;
}

function isAcceleratorDefined(
  state: Partial<Server>,
): state is PartialServerWith<"accelerator"> {
  return state.accelerator !== undefined;
}

interface VariantPick extends QuickPickItem {
  value: Variant;
}

interface AcceleratorPick extends QuickPickItem {
  value: string;
}

interface ShapePick extends QuickPickItem {
  value: Shape;
}
