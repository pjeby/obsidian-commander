import { ItemView, Menu, setIcon, WorkspaceLeaf } from "obsidian";
import t from "src/l10n";
import CommanderPlugin from "src/main";
import { CommandIconPair } from "src/types";
import ChooseCustomNameModal from "src/ui/chooseCustomNameModal";
import ChooseIconModal from "src/ui/chooseIconModal";
import ConfirmDeleteModal from "src/ui/confirmDeleteModal";
import { chooseNewCommand, isModeActive } from "src/util";
import CommandManagerBase from "./commandManager";

export default class PageHeaderManager extends CommandManagerBase {
	private addBtn = createDiv({ cls: "cmdr view-action cmdr-adder", attr: { "aria-label": t("Add new") } });
	buttons = new WeakMap<ItemView, Map<string, HTMLElement>>();

	public constructor(plugin: CommanderPlugin, pairArray: CommandIconPair[]) {
		super(plugin, pairArray);
		this.init();
	}

	private addPageHeaderButton(
		leaf: WorkspaceLeaf,
		pair: CommandIconPair
	): void {
		const { id, icon, name } = pair;
		const { view } = leaf;
		if (!(view instanceof ItemView)) return;
		if (this.buttons.get(view)?.has(id)) return;

		const buttonIcon = view.addAction(icon, name, () => {
			app.workspace.setActiveLeaf(leaf, {focus: true});
			app.commands.executeCommandById(id);
		});

		if (!this.buttons.has(view)) this.buttons.set(view, new Map);
		this.buttons.get(view)!.set(id, buttonIcon);

		buttonIcon.addClasses(["cmdr-page-header", id])
		buttonIcon.addEventListener("contextmenu", (event) => {
			event.stopImmediatePropagation();
			new Menu()
				.addItem(item => {
					item
						.setTitle(t("Add command"))
						.setIcon("command")
						.onClick(async () => {
							const pair = await chooseNewCommand(this.plugin);
							this.addCommand(pair);
						});
				})
				.addSeparator()
				.addItem(item => {
					item
						.setTitle(t("Change Icon"))
						.setIcon("box")
						.onClick(async () => {
							const newIcon = await (new ChooseIconModal(this.plugin)).awaitSelection();
							if (newIcon && newIcon !== pair.icon) {
								pair.icon = newIcon;
								await this.plugin.saveSettings();
								this.reorder();
							}
						});
				})
				.addItem(item => {
					item
						.setTitle(t("Rename"))
						.setIcon("text-cursor-input")
						.onClick(async () => {
							const newName = await (new ChooseCustomNameModal(pair.name)).awaitSelection();
							if (newName && newName !== pair.name) {
								pair.name = newName;
								await this.plugin.saveSettings();
								this.reorder();
							}
						});
				})
				.addItem(item => {
					item.dom.addClass("is-warning");
					item
						.setTitle(t("Delete"))
						.setIcon("lucide-trash")
						.onClick(async () => {
							if (!this.plugin.settings.confirmDeletion || (await new ConfirmDeleteModal(this.plugin).didChooseRemove())) {
								this.removeCommand(pair);
							}
						});
				})
				.showAtMouseEvent(event);
		});
	}

	private init(): void {
		this.plugin.register(() => {
			// Remove all buttons on plugin unload
			this.removeButtonsFromAllLeaves();
		});
		this.plugin.registerEvent(app.workspace.on("layout-change", () => {
			this.addButtonsToAllLeaves();
		}));
		this.plugin.registerEvent(app.workspace.on("active-leaf-change", activeLeaf => {
			if (this.plugin.settings.showAddCommand) activeLeaf?.containerEl.getElementsByClassName('view-actions')[0].prepend(this.addBtn);
		}));
		this.plugin.register(() => this.addBtn.remove());
		setIcon(this.addBtn, "plus");
		this.addBtn.onmouseup = async (): Promise<void> => {
			const pair = await chooseNewCommand(this.plugin);
			this.addCommand(pair);
			this.reorder();
		};

		app.workspace.onLayoutReady(() => setTimeout(() => this.addButtonsToAllLeaves(), 100));
	}

	private addButtonsToAllLeaves(refresh: boolean = false): void {
		app.workspace.iterateAllLeaves(leaf => this.addButtonsToLeaf(leaf, refresh));
	}

	private removeButtonsFromAllLeaves(): void {
		app.workspace.iterateAllLeaves(leaf => this.removeButtonsFromLeaf(leaf));
	}

	private addButtonsToLeaf(leaf: WorkspaceLeaf, refresh: boolean = false): void {
		if (!(leaf.view instanceof ItemView)) return;
		if (refresh) this.removeButtonsFromLeaf(leaf)
		for (const pair of this.pairs)
			if (isModeActive(pair.mode)) this.addPageHeaderButton(leaf, pair);
	}

	private removeButtonsFromLeaf(leaf: WorkspaceLeaf) {
		if (!(leaf.view instanceof ItemView)) return;
		for (const button of this.buttons.get(leaf.view)?.values() ?? []) button.detach();
		this.buttons.delete(leaf.view);
	}

	public reorder(): void | Promise<void> {
		this.addButtonsToAllLeaves(true);
	}

	public async addCommand(pair: CommandIconPair): Promise<void> {
		this.pairs.push(pair);
		this.addButtonsToAllLeaves();
		await this.plugin.saveSettings();
	}

	public async removeCommand(pair: CommandIconPair): Promise<void> {
		this.pairs.remove(pair);
		this.addButtonsToAllLeaves(true);
		await this.plugin.saveSettings();
	}
}
