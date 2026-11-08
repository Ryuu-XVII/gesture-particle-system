export class VoiceService {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.shouldListen = false;
        this.onCommand = null;
        this.onStatus = null;
        this.onState = null;
        this.restartTimer = null;
        this.retryCount = 0;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.lang = 'en-US';
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;
        this.recognition.onstart = () => {
            if (!this.shouldListen) {
                this.recognition.stop();
                return;
            }
            this.isListening = true;
            this.onState?.('listening');
            this.onStatus?.('Listening…');
        };
        this.recognition.onresult = event => {
            this.retryCount = 0;
            const text = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
            this.onStatus?.(`Heard: "${text}"`);
            this.processCommand(text);
        };
        this.recognition.onerror = event => {
            this.onStatus?.(`Voice error: ${event.error}`);
            this.isListening = false;
            const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'aborted'];
            if (fatal.includes(event.error)) {
                this.shouldListen = false;
                clearTimeout(this.restartTimer);
            }
            this.onState?.(this.shouldListen ? 'starting' : 'off');
        };
        this.recognition.onend = () => {
            this.isListening = false;
            if (!this.shouldListen) {
                this.onState?.('off');
                return;
            }
            if (++this.retryCount > 3) {
                this.shouldListen = false;
                this.onState?.('off');
                this.onStatus?.('Voice stopped. Click Voice Off to retry.');
                return;
            }
            this.onState?.('starting');
            clearTimeout(this.restartTimer);
            this.restartTimer = setTimeout(() => {
                if (this.shouldListen) this.startRecognition();
            }, 500 * this.retryCount);
        };
    }

    startRecognition() {
        try {
            this.recognition.start();
        } catch (error) {
            this.shouldListen = false;
            this.isListening = false;
            this.onState?.('off');
            this.onStatus?.(`Voice could not start: ${error.message}`);
        }
    }

    start(onCommand, onStatus, onState) {
        this.onCommand = onCommand;
        this.onStatus = onStatus;
        this.onState = onState;
        if (!this.recognition) {
            this.onStatus?.('Voice control is unavailable in this browser');
            this.onState?.('off');
            return false;
        }
        if (this.shouldListen) return true;
        this.retryCount = 0;
        this.shouldListen = true;
        this.onState?.('starting');
        this.onStatus?.('Starting microphone…');
        this.startRecognition();
        return this.shouldListen;
    }

    stop() {
        this.shouldListen = false;
        this.isListening = false;
        clearTimeout(this.restartTimer);
        this.recognition?.stop();
        this.onState?.('off');
    }

    dispose() {
        this.stop();
        if (!this.recognition) return;
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.onstart = null;
        this.recognition.abort();
    }

    processCommand(text) {
        const commands = {
            heart: 'heart', love: 'heart', star: 'star', firework: 'fireworks', fireworks: 'fireworks',
            flower: 'flower', bloom: 'flower', saturn: 'saturn', planet: 'saturn', ring: 'saturn',
            reality: 'reality', real: 'reality', camera: 'reality', magic: 'reality'
        };
        for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
            if (commands[word]) {
                this.onCommand?.(commands[word]);
                return;
            }
        }
    }
}
