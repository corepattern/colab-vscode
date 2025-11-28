/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import * as sinon from "sinon";
import { InputBox, QuickPick, QuickPickItem } from "vscode";
import { AssignmentManager } from "../jupyter/assignments";
import { DEFAULT_CPU_SERVER } from "../jupyter/servers";
import {
  buildInputBoxStub,
  buildQuickPickStub,
} from "../test/helpers/quick-input";
import { newVsCodeStub, VsCodeStub } from "../test/helpers/vscode";
import { Shape, Variant } from "./api";
import { ServerPicker } from "./server-picker";

const AVAILABLE_SERVERS = [
  DEFAULT_CPU_SERVER,
  {
    label: "Colab GPU T4",
    variant: Variant.GPU,
    accelerator: "T4",
  },
  {
    label: "Colab GPU A100",
    variant: Variant.GPU,
    accelerator: "A100",
  },
  {
    label: "Colab TPU V6E1",
    variant: Variant.TPU,
    accelerator: "V6E1",
  },
];

describe("ServerPicker", () => {
  let vsCodeStub: VsCodeStub;
  let assignmentStub: sinon.SinonStubbedInstance<AssignmentManager>;
  let serverPicker: ServerPicker;

  beforeEach(() => {
    vsCodeStub = newVsCodeStub();
    assignmentStub = sinon.createStubInstance(AssignmentManager);
    serverPicker = new ServerPicker(vsCodeStub.asVsCode(), assignmentStub);

    assignmentStub.getAssignedServers.resolves([]);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("prompt", () => {
    function stubQuickPickForCall(n: number) {
      const stub = buildQuickPickStub();
      vsCodeStub.window.createQuickPick
        .onCall(n)
        .returns(
          stub as Partial<QuickPick<QuickPickItem>> as QuickPick<QuickPickItem>,
        );
      return stub;
    }

    function stubInputBoxForCall(n: number) {
      const stub = buildInputBoxStub();
      vsCodeStub.window.createInputBox
        .onCall(n)
        .returns(stub as Partial<InputBox> as InputBox);
      return stub;
    }

    it("returns undefined when there are no available servers", async () => {
      await expect(serverPicker.prompt([])).to.eventually.equal(undefined);
    });

    it("returns undefined when selecting a variant is cancelled", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);

      const variantPickerShown = variantQuickPickStub.nextShow();
      const prompt = serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      variantQuickPickStub.onDidHide.yield();

      await expect(prompt).to.eventually.equal(undefined);
    });

    it("returns undefined when selecting an accelerator is cancelled", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);

      const variantPickerShown = variantQuickPickStub.nextShow();
      const prompt = serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.GPU, label: "GPU" },
      ]);
      await acceleratorPickerShown;
      acceleratorQuickPickStub.onDidHide.yield();

      await expect(prompt).to.eventually.be.undefined;
    });

    it("returns undefined when selecting an alias is cancelled", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);
      const aliasInputBoxStub = stubInputBoxForCall(0);

      const variantPickerShown = variantQuickPickStub.nextShow();
      const prompt = serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.GPU, label: "GPU" },
      ]);
      await acceleratorPickerShown;
      const aliasInputShown = aliasInputBoxStub.nextShow();
      acceleratorQuickPickStub.onDidChangeSelection.yield([
        { value: "T4", label: "T4" },
      ]);
      await aliasInputShown;
      aliasInputBoxStub.onDidHide.yield();

      await expect(prompt).to.eventually.be.undefined;
    });

    it("prompting for an accelerated is skipped when there are none", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);
      const aliasInputBoxStub = stubInputBoxForCall(0);

      const variantPickerShown = variantQuickPickStub.nextShow();
      void serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      const aliasInputShown = aliasInputBoxStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.DEFAULT, label: "CPU" },
      ]);

      await aliasInputShown;
      sinon.assert.notCalled(acceleratorQuickPickStub.show);
    });

    it("returns the server type when all prompts are answered", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);
      const aliasInputBoxStub = stubInputBoxForCall(0);

      const variantPickerShown = variantQuickPickStub.nextShow();
      const prompt = serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.GPU, label: "GPU" },
      ]);
      await acceleratorPickerShown;
      const aliasInputShown = aliasInputBoxStub.nextShow();
      acceleratorQuickPickStub.onDidChangeSelection.yield([
        { value: "T4", label: "T4" },
      ]);
      await aliasInputShown;
      aliasInputBoxStub.value = "foo";
      aliasInputBoxStub.onDidChangeValue.yield("foo");
      aliasInputBoxStub.onDidAccept.yield();

      await expect(prompt).to.eventually.be.deep.equal({
        label: "foo",
        variant: Variant.GPU,
        accelerator: "T4",
      });
    });

    it("returns a validation error message if over character limit", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const aliasInputBoxStub = stubInputBoxForCall(0);

      const variantPickerShown = variantQuickPickStub.nextShow();
      void serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      const aliasInputShown = aliasInputBoxStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.DEFAULT, label: "CPU" },
      ]);
      await aliasInputShown;
      aliasInputBoxStub.value = "s".repeat(11);
      aliasInputBoxStub.onDidChangeValue.yield(aliasInputBoxStub.value);

      expect(aliasInputBoxStub.validationMessage).to.match(/less than 10/);
    });

    it("returns the server type with the placeholder as the label when the alias is omitted", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);
      const aliasInputBoxStub = stubInputBoxForCall(0);

      const variantPickerShown = variantQuickPickStub.nextShow();
      const prompt = serverPicker.prompt(AVAILABLE_SERVERS);
      await variantPickerShown;
      const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.GPU, label: "GPU" },
      ]);
      await acceleratorPickerShown;
      assignmentStub.getDefaultLabel
        .withArgs(Variant.GPU, "T4")
        .resolves("Colab GPU T4");
      const aliasInputShown = aliasInputBoxStub.nextShow();
      acceleratorQuickPickStub.onDidChangeSelection.yield([
        { value: "T4", label: "T4" },
      ]);
      await aliasInputShown;
      aliasInputBoxStub.onDidAccept.yield();

      await expect(prompt).to.eventually.be.deep.equal({
        label: "Colab GPU T4",
        variant: Variant.GPU,
        accelerator: "T4",
      });
    });

    it("can navigate back when no accelerator was prompted", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const aliasInputBoxStub = stubInputBoxForCall(0);
      const variantPickerShown = variantQuickPickStub.nextShow();

      void serverPicker.prompt(AVAILABLE_SERVERS);

      await variantPickerShown;
      const aliasInputShown = aliasInputBoxStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.DEFAULT, label: "CPU" },
      ]);
      await aliasInputShown;
      const secondVariantQuickPickStub = stubQuickPickForCall(1);
      const secondVariantPickerShown = secondVariantQuickPickStub.nextShow();
      aliasInputBoxStub.onDidTriggerButton.yield(
        vsCodeStub.QuickInputButtons.Back,
      );
      await secondVariantPickerShown;
    });

    it("sets the previously specified value when navigating back", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);
      const aliasInputBoxStub = stubInputBoxForCall(0);
      const variantPickerShown = variantQuickPickStub.nextShow();

      void serverPicker.prompt(AVAILABLE_SERVERS);

      await variantPickerShown;
      const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.GPU, label: "GPU" },
      ]);
      await acceleratorPickerShown;
      const aliasInputShown = aliasInputBoxStub.nextShow();
      acceleratorQuickPickStub.onDidChangeSelection.yield([
        { value: "T4", label: "T4" },
      ]);
      await aliasInputShown;
      aliasInputBoxStub.value = "foo";
      aliasInputBoxStub.onDidChangeValue.yield("foo");
      // Navigate back.
      const secondAcceleratorQuickPickStub = stubQuickPickForCall(2);
      const secondVariantQuickPickStub = stubQuickPickForCall(3);
      const secondAcceleratorPickerShown =
        secondAcceleratorQuickPickStub.nextShow();
      aliasInputBoxStub.onDidTriggerButton.yield(
        vsCodeStub.QuickInputButtons.Back,
      );
      await secondAcceleratorPickerShown;
      expect(secondAcceleratorQuickPickStub.activeItems).to.be.deep.equal([
        { value: "T4", label: "T4" },
      ]);
      const secondVariantPickerShown = secondVariantQuickPickStub.nextShow();
      secondAcceleratorQuickPickStub.onDidTriggerButton.yield(
        vsCodeStub.QuickInputButtons.Back,
      );
      await secondVariantPickerShown;
      expect(secondVariantQuickPickStub.activeItems).to.be.deep.equal([
        { value: Variant.GPU, label: "GPU" },
      ]);
    });

    it("sets the right step", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const aliasInputBoxStub = stubInputBoxForCall(0);
      const variantPickerShown = variantQuickPickStub.nextShow();
      const aliasInputShown = aliasInputBoxStub.nextShow();

      void serverPicker.prompt(AVAILABLE_SERVERS);

      await variantPickerShown;
      expect(variantQuickPickStub.step).to.equal(1);
      expect(variantQuickPickStub.totalSteps).to.equal(2);

      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.DEFAULT, label: "CPU" },
      ]);

      await aliasInputShown;
      expect(aliasInputBoxStub.step).to.equal(2);
      expect(aliasInputBoxStub.totalSteps).to.equal(2);
    });

    it("sets the right step when accelerators are available", async () => {
      const variantQuickPickStub = stubQuickPickForCall(0);
      const acceleratorQuickPickStub = stubQuickPickForCall(1);
      const aliasInputBoxStub = stubInputBoxForCall(0);
      const variantPickerShown = variantQuickPickStub.nextShow();
      const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
      const aliasInputShown = aliasInputBoxStub.nextShow();

      void serverPicker.prompt(AVAILABLE_SERVERS);

      await variantPickerShown;
      expect(variantQuickPickStub.step).to.equal(1);
      expect(variantQuickPickStub.totalSteps).to.equal(2);

      variantQuickPickStub.onDidChangeSelection.yield([
        { value: Variant.GPU, label: "GPU" },
      ]);
      await acceleratorPickerShown;
      expect(acceleratorQuickPickStub.step).to.equal(2);
      expect(acceleratorQuickPickStub.totalSteps).to.equal(3);

      acceleratorQuickPickStub.onDidChangeSelection.yield([
        { value: "T4", label: "T4" },
      ]);
      await aliasInputShown;
      expect(aliasInputBoxStub.step).to.equal(3);
      expect(aliasInputBoxStub.totalSteps).to.equal(3);
    });

    describe("when high-mem is eligible", () => {
      it("prompts for shape after variant for CPU", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const shapeQuickPickStub = stubQuickPickForCall(1);
        const aliasInputBoxStub = stubInputBoxForCall(0);

        const variantPickerShown = variantQuickPickStub.nextShow();
        void serverPicker.prompt(AVAILABLE_SERVERS, true);
        await variantPickerShown;
        const shapePickerShown = shapeQuickPickStub.nextShow();
        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.DEFAULT, label: "CPU" },
        ]);
        await shapePickerShown;
        const aliasInputShown = aliasInputBoxStub.nextShow();
        shapeQuickPickStub.onDidChangeSelection.yield([
          { value: Shape.HIGHMEM, label: "High RAM" },
        ]);
        await aliasInputShown;
      });

      it("prompts for shape after accelerator for GPU", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const acceleratorQuickPickStub = stubQuickPickForCall(1);
        const shapeQuickPickStub = stubQuickPickForCall(2);
        const aliasInputBoxStub = stubInputBoxForCall(0);

        const variantPickerShown = variantQuickPickStub.nextShow();
        void serverPicker.prompt(AVAILABLE_SERVERS, true);
        await variantPickerShown;
        const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.GPU, label: "GPU" },
        ]);
        await acceleratorPickerShown;
        const shapePickerShown = shapeQuickPickStub.nextShow();
        acceleratorQuickPickStub.onDidChangeSelection.yield([
          { value: "T4", label: "T4" },
        ]);
        await shapePickerShown;
        const aliasInputShown = aliasInputBoxStub.nextShow();
        shapeQuickPickStub.onDidChangeSelection.yield([
          { value: Shape.STANDARD, label: "Standard RAM" },
        ]);
        await aliasInputShown;
      });

      it("returns the server type with shape when all prompts are answered for GPU", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const acceleratorQuickPickStub = stubQuickPickForCall(1);
        const shapeQuickPickStub = stubQuickPickForCall(2);
        const aliasInputBoxStub = stubInputBoxForCall(0);

        const variantPickerShown = variantQuickPickStub.nextShow();
        const prompt = serverPicker.prompt(AVAILABLE_SERVERS, true);
        await variantPickerShown;
        const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.GPU, label: "GPU" },
        ]);
        await acceleratorPickerShown;
        const shapePickerShown = shapeQuickPickStub.nextShow();
        acceleratorQuickPickStub.onDidChangeSelection.yield([
          { value: "T4", label: "T4" },
        ]);
        await shapePickerShown;
        const aliasInputShown = aliasInputBoxStub.nextShow();
        shapeQuickPickStub.onDidChangeSelection.yield([
          { value: Shape.HIGHMEM, label: "High RAM" },
        ]);
        await aliasInputShown;
        aliasInputBoxStub.value = "foo";
        aliasInputBoxStub.onDidChangeValue.yield("foo");
        aliasInputBoxStub.onDidAccept.yield();

        await expect(prompt).to.eventually.be.deep.equal({
          label: "foo",
          variant: Variant.GPU,
          accelerator: "T4",
          shape: Shape.HIGHMEM,
        });
      });

      it("returns the server type with shape when all prompts are answered for CPU", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const shapeQuickPickStub = stubQuickPickForCall(1);
        const aliasInputBoxStub = stubInputBoxForCall(0);

        const variantPickerShown = variantQuickPickStub.nextShow();
        const prompt = serverPicker.prompt(AVAILABLE_SERVERS, true);
        await variantPickerShown;
        const shapePickerShown = shapeQuickPickStub.nextShow();
        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.DEFAULT, label: "CPU" },
        ]);
        await shapePickerShown;
        const aliasInputShown = aliasInputBoxStub.nextShow();
        shapeQuickPickStub.onDidChangeSelection.yield([
          { value: Shape.HIGHMEM, label: "High RAM" },
        ]);
        await aliasInputShown;
        aliasInputBoxStub.value = "my-cpu";
        aliasInputBoxStub.onDidChangeValue.yield("my-cpu");
        aliasInputBoxStub.onDidAccept.yield();

        await expect(prompt).to.eventually.be.deep.equal({
          label: "my-cpu",
          variant: Variant.DEFAULT,
          accelerator: "NONE",
          shape: Shape.HIGHMEM,
        });
      });

      it("sets the right step for CPU with shape selection", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const shapeQuickPickStub = stubQuickPickForCall(1);
        const aliasInputBoxStub = stubInputBoxForCall(0);
        const variantPickerShown = variantQuickPickStub.nextShow();
        const shapePickerShown = shapeQuickPickStub.nextShow();
        const aliasInputShown = aliasInputBoxStub.nextShow();

        void serverPicker.prompt(AVAILABLE_SERVERS, true);

        await variantPickerShown;
        expect(variantQuickPickStub.step).to.equal(1);
        expect(variantQuickPickStub.totalSteps).to.equal(2);

        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.DEFAULT, label: "CPU" },
        ]);
        await shapePickerShown;
        expect(shapeQuickPickStub.step).to.equal(2);
        expect(shapeQuickPickStub.totalSteps).to.equal(3);

        shapeQuickPickStub.onDidChangeSelection.yield([
          { value: Shape.HIGHMEM, label: "High RAM" },
        ]);
        await aliasInputShown;
        expect(aliasInputBoxStub.step).to.equal(3);
        expect(aliasInputBoxStub.totalSteps).to.equal(3);
      });

      it("sets the right step for GPU with shape selection", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const acceleratorQuickPickStub = stubQuickPickForCall(1);
        const shapeQuickPickStub = stubQuickPickForCall(2);
        const aliasInputBoxStub = stubInputBoxForCall(0);
        const variantPickerShown = variantQuickPickStub.nextShow();
        const acceleratorPickerShown = acceleratorQuickPickStub.nextShow();
        const shapePickerShown = shapeQuickPickStub.nextShow();
        const aliasInputShown = aliasInputBoxStub.nextShow();

        void serverPicker.prompt(AVAILABLE_SERVERS, true);

        await variantPickerShown;
        expect(variantQuickPickStub.step).to.equal(1);
        expect(variantQuickPickStub.totalSteps).to.equal(2);

        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.GPU, label: "GPU" },
        ]);
        await acceleratorPickerShown;
        expect(acceleratorQuickPickStub.step).to.equal(2);
        expect(acceleratorQuickPickStub.totalSteps).to.equal(4);

        acceleratorQuickPickStub.onDidChangeSelection.yield([
          { value: "T4", label: "T4" },
        ]);
        await shapePickerShown;
        expect(shapeQuickPickStub.step).to.equal(3);
        expect(shapeQuickPickStub.totalSteps).to.equal(4);

        shapeQuickPickStub.onDidChangeSelection.yield([
          { value: Shape.STANDARD, label: "Standard RAM" },
        ]);
        await aliasInputShown;
        expect(aliasInputBoxStub.step).to.equal(4);
        expect(aliasInputBoxStub.totalSteps).to.equal(4);
      });

      it("returns undefined when selecting shape is cancelled", async () => {
        const variantQuickPickStub = stubQuickPickForCall(0);
        const shapeQuickPickStub = stubQuickPickForCall(1);

        const variantPickerShown = variantQuickPickStub.nextShow();
        const prompt = serverPicker.prompt(AVAILABLE_SERVERS, true);
        await variantPickerShown;
        const shapePickerShown = shapeQuickPickStub.nextShow();
        variantQuickPickStub.onDidChangeSelection.yield([
          { value: Variant.DEFAULT, label: "CPU" },
        ]);
        await shapePickerShown;
        shapeQuickPickStub.onDidHide.yield();

        await expect(prompt).to.eventually.be.undefined;
      });
    });
  });
});
