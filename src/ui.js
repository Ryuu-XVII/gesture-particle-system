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

    updateGesture(data) {
        const el = document.getElementById('gesture-display');
        if (el) el.innerText = data.gesture
            ? `${data.gesture} (${Math.round(data.confidence * 100)}% fit)`
            : data.candidate ? `Hold ${data.candidate}…` : '—';
        const hint = document.getElementById('tracking-hint');
        if (!hint) return;
        const shapes = { HEART_HANDS: 'Heart', STAR_HANDS: 'Star', FLOWER_HANDS: 'Flower' };
        if (!data.handCount) {
            hint.innerText = 'Show a hand to control particles. Shape buttons always work.';
        } else if (data.motion.shape) {
            hint.innerText = `${shapes[data.motion.shape]} pose confirmed · ${Math.round(data.motion.energy * 100)}% motion`;
        } else if (data.motion.candidateShape) {
            hint.innerText = `Hold the ${shapes[data.motion.candidateShape]} pose briefly to confirm`;
        } else if (data.gesture === 'Point') {
            hint.innerText = 'Point to steer · keep your other fingers curled';
        } else if (data.gesture === 'Peace') {
            hint.innerText = 'Peace confirmed · changing colors';
        } else {
            hint.innerText = `Curl fingers to change size · ${data.handCount} hand${data.handCount > 1 ? 's' : ''} tracked`;
        }
    }

    updateBackend(backendName) {
        const el = document.getElementById('backend-display');
        if (el) el.innerText = backendName;
    }
}
