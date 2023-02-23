/*
  
S> Which kind of joke do you want to hear?
U> programming
S> Ok, progamming. Here you go!
S> Debugging is like being the detective in a crime movie where you're also the murderer at the same time.
U> HAHAHA
S> What's funny?
U> ....
S> I see!

S> Which kind of joke do you want to hear?
U> blabla
S> I don't know any jokes of this kind. What kind of joke do you want to hear?

*/

import { MachineConfig, send, Action, assign } from "xstate";

interface Grammar {
  [index: string]: {
    intent: string;
    entities: {
      [index: string]: string;
    };
  };
}

const grammar: Grammar = {
  programming: { intent: "None", entities: { topic: "programming" } },
  pun: { intent: "None", entities: { topic: "pun" } },
  "word play": { intent: "None", entities: { topic: "pun" } },
};

const getEntity = (context: SDSContext, entity: string) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  if (u in grammar) {
    if (entity in grammar[u].entities) {
      return grammar[u].entities[entity];
    }
  }
  return undefined;
};

export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  initial: "idle",
  states: {
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      on: {
        TTS_READY: "welcome",
        CLICK: "welcome",
      },
    },
    welcome: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "tellJoke",
            cond: (context) => {
              return !!getEntity(context, "topic");
            },
            actions: assign({
              topic: (context) => getEntity(context, "topic")!,
            }),
          },
          { target: ".nomatch" },
        ],
        TIMEOUT: ".noinput",
      },
      states: {
        noinput: {
          entry: send({
            type: "SPEAK",
            value: "I don't quite hear you.",
          }),
          on: {
            ENDSPEECH: "prompt",
          },
        },
        prompt: {
          initial: "choice",

          states: {
            choice: {
              always: [
                {
                  target: "p2.hist",
                  cond: (context) => context.count === 2,
                },
                "p1",
              ],
            },
            p1: {
              entry: [assign({ count: 2 })],
              initial: "prompt",
              states: {
                prompt: {
                  entry: send({
                    type: "SPEAK",
                    value: "Which kind of joke do you want to hear?",
                  }),
                  on: { ENDSPEECH: "ask" },
                },
                ask: {
                  entry: send("LISTEN"),
                },
              },
            },
            p2: {
              initial: "prompt",
              states: {
                hist: { type: "history" },
                prompt: {
                  entry: send({
                    type: "SPEAK",
                    value: "Which kind of joke?",
                  }),
                  on: { ENDSPEECH: "ask" },
                },
                ask: {
                  entry: send("LISTEN"),
                },
              },
            },
          },
        },
        nomatch: {
          entry: send({
            type: "SPEAK",
            value: "I don't know any jokes of this kind.",
          }),
          on: {
            ENDSPEECH: "prompt",
          },
        },
      },
    },
    tellJoke: {
      initial: "ground",
      states: {
        ground: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Ok, ${context.topic}.`,
          })),
          on: {
            ENDSPEECH: "prompt",
          },
        },
        prompt: {
          entry: send({
            type: "SPEAK",
            value:
              "Here you go! Debugging is like being the detective in a crime movie where you're also the murderer at the same time.",
          }),
        },
      },
    },
  },
};
