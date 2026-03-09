export class VoiceService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.onCommand = null; // Callback
        this.onStatus = null;  // Callback for UI status

        // Browser compatibility
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true; // Keep listening
            this.recognition.lang = 'en-US';
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;

            this.recognition.onresult = (event) => {
                const last = event.results.length - 1;
                const text = event.results[last][0].transcript.trim().toLowerCase();
                console.log('Voice Heard:', text);

                if (this.onStatus) this.onStatus(`Heard: "${text}"`);

                this.processCommand(text);
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                if (this.onStatus) this.onStatus(`Error: ${event.error}`);
            };

            this.recognition.onend = () => {
                // Auto-restart if we are supposed to be listening
                if (this.isListening) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        // ignore if already started
                    }
                } else {
                    if (this.onStatus) this.onStatus('');
                }
            };
        } else {
            console.warn("Speech Recognition not supported in this browser.");
        }
    }

    start(onCommand, onStatus) {
        if (!this.recognition) {
            alert("Voice control not supported in this browser (Use Chrome/Edge).");
            return;
        }
        this.onCommand = onCommand;
        this.onStatus = onStatus;
        this.isListening = true;
        try {
            this.recognition.start();
            if (this.onStatus) this.onStatus("Listening...");
        } catch (e) {
            console.error(e);
        }
    }

    stop() {
        this.isListening = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        if (this.onStatus) this.onStatus("");
    }

    processCommand(text) {
        // Fuzzy matching for known shapes
        const commands = {
            'heart': 'heart',
            'love': 'heart',
            'star': 'star',
            'firework': 'fireworks',
            'fireworks': 'fireworks',
            'flower': 'flower',
            'bloom': 'flower',
            'saturn': 'saturn',
            'planet': 'saturn',
            'ring': 'saturn',
            'reality': 'reality',
            'real': 'reality',
            'camera': 'reality',
            'magic': 'reality'
        };

        // Check if text contains any key
        for (const [key, value] of Object.entries(commands)) {
            if (text.includes(key)) {
                if (this.onCommand) this.onCommand(value);
                return;
            }
        }
    }
}
