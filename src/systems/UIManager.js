export class UIManager {
    constructor(app, worldContainer, timeManager, peopleManager, vehicleManager, model) {
        this.app = app;
        this.worldContainer = worldContainer;
        this.timeManager = timeManager;
        this.peopleManager = peopleManager;
        this.vehicleManager = vehicleManager;
        this.model = model;

        this.statsText = document.getElementById('stats-text');
        this.sidebar = this.createSidebar();

        this.setupZoomControls();
        this.setupSpeedControl();
    }

    createSidebar() {
        let sidebar = document.querySelector('.stats-sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.className = 'stats-sidebar'; // Class for styling if needed
            sidebar.style.position = 'absolute';
            sidebar.style.top = '10px';
            sidebar.style.right = '10px';
            sidebar.style.width = '250px';
            sidebar.style.background = 'rgba(0, 0, 0, 0.8)';
            sidebar.style.color = 'white';
            sidebar.style.padding = '15px';
            sidebar.style.borderRadius = '8px';
            sidebar.style.fontFamily = 'monospace';
            sidebar.style.display = 'none'; // Hidden by default
            document.body.appendChild(sidebar);

            const btnStats = document.createElement('button');
            btnStats.textContent = '📊 Detail Stats';
            btnStats.style.marginTop = '10px';
            // Insert into the controls group if possible, or append to body for now
            const controls = document.getElementById('controls');
            if (controls) controls.appendChild(btnStats);

            btnStats.addEventListener('click', () => {
                sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
            });
        }
        return sidebar;
    }

    setupZoomControls() {
        // Create zoom buttons container
        const zoomContainer = document.createElement('div');
        zoomContainer.style.position = 'absolute';
        zoomContainer.style.bottom = '20px';
        zoomContainer.style.right = '20px';
        zoomContainer.style.display = 'flex';
        zoomContainer.style.gap = '5px';
        document.body.appendChild(zoomContainer);

        const createBtn = (text, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.width = '30px';
            btn.style.height = '30px';
            btn.style.borderRadius = '5px';
            btn.style.background = '#444';
            btn.style.color = 'white';
            btn.style.border = '1px solid #666';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', onClick);
            zoomContainer.appendChild(btn);
        };

        createBtn('+', () => this.zoomIn());
        createBtn('-', () => this.zoomOut());
    }

    setupSpeedControl() {
        const slider = document.getElementById('speed-slider');
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                // Map slider 1-1200 to timeScale
                this.timeManager.timeScale = val;
            });
        }
    }

    zoomIn() {
        const newScale = Math.min(5, this.worldContainer.scale.x * 1.2);
        this.worldContainer.scale.set(newScale);
    }

    zoomOut() {
        const newScale = Math.max(0.4, this.worldContainer.scale.x / 1.2);
        this.worldContainer.scale.set(newScale);
    }

    updateStats(isPaused) {
        if (!this.statsText) return;

        const timeEmoji = this.timeManager.isDaytime() ? '☀️' : '🌙';
        const activePeople = this.peopleManager ? this.peopleManager.people.length : 0;
        const activeCars = this.vehicleManager ? this.vehicleManager.vehicles.length : 0;

        // Update Top Bar
        this.statsText.textContent = `${timeEmoji} ${this.timeManager.getTimeString()} | Pop: ${activePeople} | Cars: ${activeCars} ${isPaused ? '(PAUSED)' : ''}`;

        // Update Sidebar
        if (this.sidebar.style.display !== 'none') {
            const zones = this.model.zones;
            const res = zones.filter(z => z.type === 'residential').length;
            const com = zones.filter(z => z.type === 'commercial').length;
            const ind = zones.filter(z => z.type === 'industrial').length;

            // Calculate avg speed if vehicles exist
            let avgSpeed = 0;
            if (this.vehicleManager && this.vehicleManager.vehicles.length > 0) {
                // Sample first 10 for performance or logic needs implementation in vehicle manager
                avgSpeed = 'N/A';
            }

            this.sidebar.innerHTML = `
                <h3>Town Metrics</h3>
                <p>Time: ${this.timeManager.getTimeString()}</p>
                <p>Scale: ${this.timeManager.timeScale}x</p>
                <p>Population: ${activePeople}</p>
                <p>Vehicles: ${activeCars}</p>
                <hr>
                <p><strong>Zones:</strong></p>
                <ul>
                  <li>Residential: ${res}</li>
                  <li>Commercial: ${com}</li>
                  <li>Industrial: ${ind}</li>
                </ul>
                <div style="font-size:10px; color:#aaa; margin-top:10px;">
                   Zoom > 2.5x to see labels
                </div>
            `;
        }
    }
}
