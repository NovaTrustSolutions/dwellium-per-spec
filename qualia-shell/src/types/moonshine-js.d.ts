declare module '@moonshine-ai/moonshine-js' {
    export interface TranscriberCallbacks {
        onPermissionsRequested: () => any;
        onError: (error: any) => any;
        onModelLoadStarted: () => any;
        onModelLoaded: () => any;
        onTranscribeStarted: () => any;
        onTranscribeStopped: () => any;
        onTranscriptionUpdated: (text: string) => any;
        onTranscriptionCommitted: (text: string, buffer?: AudioBuffer) => any;
        onFrame: (probs: any, frame: any, ema: any) => any;
        onSpeechStart: () => any;
        onSpeechEnd: () => any;
    }

    export class Transcriber {
        isActive: boolean;
        constructor(
            modelURL: string,
            callbacks?: Partial<TranscriberCallbacks>,
            useVAD?: boolean,
            precision?: string
        );
        attachStream(stream: MediaStream): void;
        start(): Promise<void>;
        stop(): void;
    }

    export class MicrophoneTranscriber extends Transcriber {
        constructor(
            modelURL: string,
            callbacks?: Partial<TranscriberCallbacks>,
            useVAD?: boolean,
            precision?: string
        );
        start(): Promise<void>;
    }

    export class MediaElementTranscriber extends Transcriber { }
    export class VideoCaptioner extends MediaElementTranscriber { }
    export class MoonshineSpeechRecognition { }
    export class MoonshineModel { }
    export class MoonshineError { }
    export class VoiceController { }
    export class KeywordSpotter { }
    export class IntentClassifier { }

    export const Settings: {
        FRAME_SIZE: number;
        STREAM_UPDATE_INTERVAL: number;
        BASE_ASSET_PATH: {
            MOONSHINE: string;
            ONNX_RUNTIME: string;
            SILERO_VAD: string;
        };
        VERBOSE_LOGGING: boolean;
    };
}
