import i18n from "@/i18n";
import type { ReadAloudScope } from "@/features/readAloud/extraction";
import { startReadAloud, stopReadAloud } from "@/features/readAloud/runtime";
import {
  registerCommands,
  type CommandContext,
  type CommandDefinition,
} from "./CommandBus";
import { useSettingsStore } from "@/stores/settingsStore";

export interface ReadAloudCommandActions {
  start: (windowLabel: string, scope: ReadAloudScope) => Promise<boolean>;
  stop: () => Promise<void>;
}

const runtimeActions: ReadAloudCommandActions = {
  start: startReadAloud,
  stop: stopReadAloud,
};

const READ_ALOUD_COMMANDS_OWNER = "read-aloud-commands";

function canRead(context: CommandContext): boolean {
  return context.isDocument === true && context.editorAvailable === true && useSettingsStore.getState().speech.enabled;
}

function windowLabel(context: CommandContext): string {
  return typeof context.windowLabel === "string" ? context.windowLabel : "main";
}

function buildReadAloudCommandSpecs(
  actions: ReadAloudCommandActions,
): CommandDefinition[] {
  const scopes: readonly [string, string, ReadAloudScope][] = [
    ["speech.readSelection", "commands:speech.readSelection", "selection"],
    ["speech.readBlock", "commands:speech.readBlock", "block"],
    ["speech.readFromCursor", "commands:speech.readFromCursor", "fromCursor"],
    ["speech.readDocument", "commands:speech.readDocument", "document"],
  ];
  const commands = scopes.map<CommandDefinition>(([id, titleKey, scope]) => ({
      id,
      title: () => i18n.t(titleKey),
      category: "other",
      when: (context) =>
        canRead(context) && (scope !== "selection" || context.hasSelection === true),
      run: async (_args, context) => {
        await actions.start(windowLabel(context), scope);
      },
    }));

  commands.push({
    id: "speech.stop",
    title: () => i18n.t("commands:speech.stop"),
    category: "other",
    run: async () => actions.stop(),
  });
  return commands;
}

export function registerReadAloudCommands(
  actions: ReadAloudCommandActions = runtimeActions,
): void {
  registerCommands(
    READ_ALOUD_COMMANDS_OWNER,
    buildReadAloudCommandSpecs(actions),
  );
}
