import { TownModel } from '../town/TownModel.js';
import { TownRenderer } from '../town/TownRenderer.js';
import { InputController } from '../town/InputController.js';

export class TownEditor {
    constructor(app, container) {
        this.app = app;
        this.container = container;

        this.model = new TownModel();
        this.renderer = new TownRenderer(this.model, this.container, this.app);
        this.inputController = new InputController(this.model, this.renderer, this.app);

        // Load default
        this.model.loadExample();
    }
}
