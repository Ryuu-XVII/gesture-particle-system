export class UIManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.fpsCounter = document.getElementById('fps-counter');
        this.statusText = document.getElementById('status-text');

        this.initListeners();
    }

    initListeners() {
        // Shapes
        const shapeBtns = document.querySelectorAll('.shape-btn');
        shapeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // UI update
                shapeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Scene update
                const shape = btn.dataset.shape;
                this.sceneManager.setShape(shape);
            });
        });

        // Color
        const colorPicker = document.getElementById('particle-color');
        colorPicker.addEventListener('input', (e) => {
            this.sceneManager.setColor(e.target.value);
        });
    }

    updateStats(fps) {
        this.fpsCounter.innerText = fps;
    }

    setStatus(text) {
        this.statusText.innerText = text;
    }

    updateGesture(gestureName) {
        const el = document.getElementById('gesture-display');
        if (el) el.innerText = gestureName || '-';
    }

    updateBackend(backendName) {
        const el = document.getElementById('backend-display');
        if (el) el.innerText = backendName;
    }
}
