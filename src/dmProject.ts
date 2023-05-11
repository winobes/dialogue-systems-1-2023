import { MachineConfig, send, Action, assign } from "xstate";

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

const getEntity = (context: SDSContext, entity: string) => {
  // lowercase the utterance and remove tailing "."
  for (var ent of context.nluResult.prediction.entities) {
    if (ent.category == entity) {
      return ent.text
    }
  }
  return false;
};

const isIntent = (context: SDSContext, intent: string) => {
  if (context.nluResult.prediction.topIntent == intent) {
    return true;
  }
  return false;
}

const alphaVal = (s) => s.toLowerCase().charCodeAt(0) - 97 

function translateMove(m: String) {
  console.log('tra m', m)
  x_ = alphaVal(m[0]);
  console.log('tra x', x_)
  y_ = 5 - parseInt(m.slice(1))
  console.log('tra y', y_)
  return {x: x_, y: y_};
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
                target: "userTurn",
                cond: (context) => isIntent(context, "Affirmative"),
                actions: [
                  say("Okay, I'll play white. That means you go first. You can tell me your moves by saying a letter number coordinate. For example, you can say 'I want to play at D4'. You can also decide to pass at any time if you think the game is over. What's your first move?")
                ]
              },
              {
                target: "idle",
                cond: (context) => isIntent(context, "Negatory"),
              },
              {
                target: ".nomatch",
              },
            ],
            TIMEOUT: ".prompt"
          },
          states: {
            prompt: {
              entry: say("Do you want to play?"),
              on: { ENDSPEECH: "ask" },
            },
            ask: {
              entry: send("LISTEN"),
            },
            nomatch: {
              entry: say(
                "I didn't understand that."
              ),
              on: { ENDSPEECH: "ask" },
            },
          },
        },

        userTurn:{
          initial: "prompt",
          on: {
            RECOGNISED: [
              {
                cond: (context) => isIntent(context, "PlayMove") && !!getEntity(context, "AbsCoordinates"),
                actions:  [ 
                  assign({ userMove: (context) => translateMove(getEntity(context, "AbsCoordinates"))}),
                  'makeMove'
                ],
                target: "systemTurn"
              },
              {
                cond: (context) => isIntent(context, "Pass") ,
                actions: [ 'pass' ],
                target: "systemTurn"
              },
              {
                target: ".nomatch",
              }
            ],
            MOVEERROR: ".prompt",
            TIMEOUT: ".prompt"
          },
          states:{
            prompt: {
              entry: say("Where do you want to go?"),
              on: { ENDSPEECH: "ask" },
            },
            ask: {
              entry: send("LISTEN"),
            },
            nomatch: {
              entry: say(
                "I didn't understand that."
              ),
              on: { ENDSPEECH: "ask" },
            },
          },
        },

        systemTurn:{
          entry: [
            'makeRandomMove',
            say("I'll go here."),
          ],
          on: { ENDSPEECH: "userTurn"},
        }

      }
};

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());
