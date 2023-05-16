import "./styles.css";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { createMachine, assign, actions, State } from "xstate";
import { useMachine } from "@xstate/react";
import { inspect } from "@xstate/inspect";
import { dmMachine } from "./dmProject";


import createSpeechRecognitionPonyfill from "web-speech-cognitive-services/lib/SpeechServices/SpeechToText";
import createSpeechSynthesisPonyfill from "web-speech-cognitive-services/lib/SpeechServices/TextToSpeech";

import { EventEmitter } from "eventemitter3";
import { GobanCanvas, GobanMoveError, ScoreEstimator, init_score_estimator} from "goban/lib/goban";

//init_score_estimator();

const { send, cancel } = actions;

const TOKEN_ENDPOINT =
  "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken";
const REGION = "northeurope";

if (process.env.NODE_ENV === "development") {
  inspect({
    iframe: false,
  });
}

const defaultPassivity = 5;

const machine = createMachine(
  {
    predictableActionArguments: true,
    schema: {
      context: {} as SDSContext,
      events: {} as SDSEvent,
    },
    id: "root",
    type: "parallel",
    states: {
      dm: {
        ...dmMachine,
      },

      asrtts: {
        initial: "init",
        states: {
          init: {
            on: {
              CLICK: {
                target: "getToken",
                actions: [
                  "createAudioContext",
                  (context) =>
                    navigator.mediaDevices
                      .getUserMedia({ audio: true })
                      .then(function (stream) {
                        context.audioCtx.createMediaStreamSource(stream);
                      }),
                ],
              },
            },
          },
          getToken: {
            invoke: {
              id: "getAuthorizationToken",
              src: (context) =>
                getAuthorizationToken(context.parameters.azureKey!),
              onDone: {
                actions: ["assignToken", "ponyfillASR"],
                target: "ponyfillTTS",
              },
              onError: {
                target: "fail",
              },
            },
          },
          ponyfillTTS: {
            invoke: {
              id: "ponyTTS",
              src: (context, _event) => (callback, _onReceive) => {
                const ponyfill = createSpeechSynthesisPonyfill({
                  audioContext: context.audioCtx,
                  credentials: {
                    region: REGION,
                    authorizationToken: context.azureAuthorizationToken,
                  },
                });
                const { speechSynthesis, SpeechSynthesisUtterance } = ponyfill;
                context.tts = speechSynthesis;
                context.ttsUtterance = SpeechSynthesisUtterance;
                context.tts.addEventListener("voiceschanged", () => {
                  context.tts.cancel();
                  const voices = context.tts.getVoices();
                  const voiceRe = RegExp(context.parameters.ttsVoice, "u");
                  const voice = voices.find((v: any) => voiceRe.test(v.name))!;
                  if (voice) {
                    context.voice = voice;
                    callback("TTS_READY");
                  } else {
                    console.error(
                      `TTS_ERROR: Could not get voice for regexp ${voiceRe}`
                    );
                    callback("TTS_ERROR");
                  }
                });
              },
            },
            on: {
              TTS_READY: "idle",
              TTS_ERROR: "fail",
            },
          },
          idle: {
            on: {
              LISTEN: "recognising",
              SPEAK: {
                target: "speaking",
                actions: "assignAgenda",
              },
            },
          },
          recognising: {
            initial: "noinput",
            exit: "recStop",
            on: {
              ASRRESULT: {
                actions: "assignRecResult",
                target: ".match",
              },
              RECOGNISED: { target: "idle", actions: "recLogResult" },
              SELECT: "idle",
              CLICK: ".pause",
            },
            states: {
              noinput: {
                entry: [
                  "recStart",
                  send(
                    { type: "TIMEOUT" },
                    {
                      delay: (_context: SDSContext) => 1000 * defaultPassivity,
                      id: "timeout",
                    }
                  ),
                ],
                on: {
                  TIMEOUT: "#root.asrtts.idle",
                  STARTSPEECH: "inprogress",
                },
                exit: cancel("timeout"),
              },
              inprogress: {},
              match: {
                invoke: {
                  id: "getIntents",
                  src: (context) => getIntents(context),
                  onDone: {
                    actions: ["assignIntents", "sendRecognised"],
                  },
                  onError: {
                    actions: "sendRecognised",
                  },
                },
              },
              pause: {
                entry: "recStop",
                on: { CLICK: "noinput" },
              },
            },
          },
          speaking: {
            entry: "ttsStart",
            on: {
              ENDSPEECH: "idle",
              SELECT: "idle",
              CLICK: { target: "idle", actions: "sendEndspeech" },
            },
            exit: "ttsStop",
          },
          fail: {},
        },
      },
    },
  },
  {
    guards: {
      prob: (_context, _event, { cond }: any) => {
        let rnd = Math.random();
        return rnd >= cond.threshold ? true : false;
      },
    },
    actions: {
      makeMove: (context: SDSContext) => {
        console.log("action", context.userMove)
        fiddler.emit("MAKEMOVE", context.userMove.x, context.userMove.y);
      },
      pass: (context: SDSContext) => {
        console.log("pass")
	fiddler.emit("PASS")
      },
      makeRandomMove: (context: SDSContext) => {
        console.log("action", context.userMove);
        fiddler.emit("MAKERANDOMMOVE");
      },
      createAudioContext: (context: SDSContext) => {
        context.audioCtx = new ((window as any).AudioContext ||
          (window as any).webkitAudioContext)();
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then(function (stream) {
            context.audioCtx.createMediaStreamSource(stream);
          });
      },
      assignToken: assign({
        azureAuthorizationToken: (_context, event: any) => event.data,
      }),
      assignAgenda: assign({
        ttsAgenda: (_context, event: any) => event.value,
      }),
      assignRecResult: assign({
        recResult: (_context, event: any) => event.value,
      }),
      sendEndspeech: send("ENDSPEECH"),
      assignIntents: assign({
        nluResult: (_context, event: any) => {
          return event.data.result;
        },
      }),
      sendRecognised: send("RECOGNISED"),
      recLogResult: (context: SDSContext) => {
        console.log("U>", context.recResult[0]["utterance"], {
          confidence: context.recResult[0]["confidence"],
        });
      },
      changeColour: (context) => {
        let color = context.recResult[0].utterance
          .toLowerCase()
          .replace(/[\W_]+/g, "");
        console.log(`(repaiting to ${color})`);
        document.body.style.backgroundColor = color;
      },
    },
  }
);

interface ButtonProps extends React.HTMLAttributes<HTMLElement> {
  state: State<SDSContext, any, any, any, any>;
  alternative: any;
}
const StatusButton = (props: ButtonProps): JSX.Element => {
  var promptText = "\u00A0";
  var circleClass = "circle";
  switch (true) {
    case props.state.matches({ asrtts: "fail" }) ||
      props.state.matches({ dm: "fail" }):
      break;
    case props.state.matches({ asrtts: { recognising: "pause" } }):
      promptText = "Click to continue";
      break;
    case props.state.matches({ asrtts: "recognising" }):
      circleClass = "circle-recognising";
      promptText = "Listening...";
      break;
    case props.state.matches({ asrtts: "speaking" }):
      circleClass = "circle-speaking";
      promptText = "Speaking...";
      break;
    case props.state.matches({ dm: "idle" }):
      promptText = "Click to start!";
      circleClass = "circle-click";
      break;
    case props.state.matches({ dm: "init" }):
      promptText = "Click to start!";
      circleClass = "circle-click";
      break;
    default:
      promptText = "\u00A0";
  }
  return (
    <div className="control">
      <div className="status">
        <button
          type="button"
          className={circleClass}
          style={{}}
          {...props}
        ></button>
        <div className="status-text">{promptText}</div>
      </div>
    </div>
  );
};

const base_config: GobanCanvasConfig = {
    interactive: true,
    mode: "puzzle",
    square_size: 10,
    draw_top_labels: true,
    draw_left_labels: true,
    draw_right_labels: false,
    draw_bottom_labels: false,
    game_id: 42,
    width: 5,
    height: 5,
    bounds: {
        left: 0,
        right: 4,
        top: 0,
        bottom: 4,
    },
};

const fiddler = new EventEmitter();

function ReactGoban(): JSX.Element {
  const container = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
  
      const config: GobanCanvasConfig = Object.assign(base_config, {
          board_div: container.current, 
      });

      goban = new GobanCanvas(config);
      //se = new ScoreEstimator(goban, goban.engine)

      fiddler.on("MAKEMOVE", (x: number, y: number) => {
        console.log("placing", x, y);
        try {
          goban.engine.place(x,y);
        } catch (e) {
          if (e instanceof GobanMoveError) {
            if (e.message_id == "stone_already_placed_here"){
              send("STONEALREADY")
            }
          } else {
            throw(e);
          }
        }
      });

      fiddler.on("PASS", () => {
        goban.engine.pass();
      });

      fiddler.on("MAKERANDOMMOVE", (x: number, y: number) => {
        let tries = 0;
        let success = false;
        //console.log(goban.engine.estimateScore(5,3));
        //console.log(se.estimateScore(5,3));
        while (tries < 30 && !success) {
          let x = Math.floor(Math.random() * 5);
          let y = Math.floor(Math.random() * 5);
          try {
            console.log("random placing", x, y);
            goban.engine.place(x,y);
            success = true;
          } catch (e) {
            if (e instanceof GobanMoveError) {
              if (e.message_id == "stone_already_placed_here"){
                send("STONEALREADY")
              }
            } else {
              throw(e);
            }
          }
        }
      });

      return () => {
        goban.destroy();
      };
  }, [container]);

  return (
      <React.Fragment>
          <div ref={container} className="goban-container">
          </div>
      </React.Fragment>
  );
}

function App({ domElement }: any) {

    const [_update, _setUpdate] = React.useState(1);
    function forceUpdate() {
        _setUpdate(_update + 1);
    }

  const externalContext = {
    parameters: {
      ttsVoice: domElement.getAttribute("data-tts-voice") || "en-US",
      ttsLexicon: domElement.getAttribute("data-tts-lexicon"),
      asrLanguage: domElement.getAttribute("data-asr-language") || "en-US",
      azureKey: domElement.getAttribute("data-azure-key"),
      azureNLUKey: domElement.getAttribute("data-azure-nlu-key"),
      azureNLUUrl: domElement.getAttribute("data-azure-nlu-url"),
      azureNLUprojectName: domElement.getAttribute(
        "data-azure-nlu-project-name"
      ),
      azureNLUdeploymentName: domElement.getAttribute(
        "data-azure-nlu-deployment-name"
      ),
    },
  };
  const [state, send] = useMachine(machine, {
    context: { ...machine.context, ...externalContext },
    devTools: process.env.NODE_ENV === "development" ? true : false,
    actions: {
      recStart: (context) => {
        context.asr.start();
        /* console.log('Ready to receive a voice input.'); */
      },
      recStop: (context) => {
        context.asr.abort?.();
        /* console.log('Recognition stopped.'); */
      },
      ttsStart: (context) => {
        let content = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${context.voice.name}">`;
        content =
          content +
          (context.parameters.ttsLexicon
            ? `<lexicon uri="${context.parameters.ttsLexicon}"/>`
            : "");
        content = content + `${context.ttsAgenda}</voice></speak>`;
        const utterance = new context.ttsUtterance(content);
        console.log("S>", context.ttsAgenda);
        utterance.voice = context.voice;
        utterance.onend = () => send("ENDSPEECH");
        context.tts.speak(utterance);
      },
      ttsStop: (context) => {
        /* console.log('TTS STOP...'); */
        context.tts.cancel();
      },
      ponyfillASR: (context) => {
        const { SpeechRecognition } = createSpeechRecognitionPonyfill({
          audioContext: context.audioCtx,
          credentials: {
            region: REGION,
            authorizationToken: context.azureAuthorizationToken,
          },
        });
        context.asr = new SpeechRecognition();
        context.asr.lang = context.parameters.asrLanguage || "en-US";
        context.asr.continuous = true;
        context.asr.interimResults = true;
        context.asr.onresult = function (event: any) {
          var result = event.results[0];
          if (result.isFinal) {
            send({
              type: "ASRRESULT",
              value: [
                {
                  utterance: result[0].transcript,
                  confidence: result[0].confidence,
                },
              ],
            });
          } else {
            send({ type: "STARTSPEECH" });
          }
        };
      },
    },
  });

	return (
    <div className="App">
    <StatusButton
      state={state}
      key={machine.id}
      alternative={{}}
      onClick={() => send("CLICK")}
      //onClick={() => fiddler.emit("MAKEMOVE")}
		/>
    <ReactGoban />
    </div>
  );
}

const getAuthorizationToken = (azureKey: string) =>
  fetch(
    new Request(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": azureKey,
      },
    })
  ).then((data) => data.text());

const getIntents = (context: SDSContext) =>
  fetch(
    new Request(context.parameters.azureNLUUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": context.parameters.azureNLUKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "Conversation",
        analysisInput: {
          conversationItem: {
            id: "PARTICIPANT_ID_HERE",
            text: context.recResult[0].utterance,
            modality: "text",
            language: context.parameters.asrLanguage,
            participantId: "PARTICIPANT_ID_HERE",
          },
        },
        parameters: {
          projectName: context.parameters.azureNLUprojectName,
          verbose: true,
          deploymentName: context.parameters.azureNLUdeploymentName,
          stringIndexType: "TextElement_V8",
        },
      }),
    })
  ).then((data) => data.json());

const rootElement = document.getElementById("speechstate");
ReactDOM.render(<App domElement={rootElement} />, rootElement);
