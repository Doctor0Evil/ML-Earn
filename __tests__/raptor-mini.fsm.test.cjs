const fc = require('fast-check');

// simple FSM states and transitions used for property-based tests
const State = {
  Idle: 'Idle',
  Armed: 'Armed',
  Active: 'Active',
  Error: 'Error',
};

const Event = {
  arm: 'arm',
  fire: 'fire',
  reset: 'reset',
  disarm: 'disarm',
  error: 'error',
};

function modelNext(state, event) {
  switch (state) {
    case State.Idle:
      if (event === Event.arm) return State.Armed;
      if (event === Event.fire) return State.Idle; // ignored
      return state;
    case State.Armed:
      if (event === Event.fire) return State.Active;
      if (event === Event.disarm) return State.Idle;
      if (event === Event.error) return State.Error;
      return state;
    case State.Active:
      if (event === Event.reset) return State.Idle;
      if (event === Event.error) return State.Error;
      return state;
    case State.Error:
      if (event === Event.reset) return State.Idle;
      return State.Error;
    default:
      return state;
  }
}

// implementation under test
class RaptorMini {
  constructor() {
    this.state = State.Idle;
  }

  handle(event) {
    if (this.state === State.Error && event !== Event.reset) return this.state; // cannot leave Error except reset
    switch (this.state) {
      case State.Idle:
        if (event === Event.arm) this.state = State.Armed;
        if (event === Event.fire) this.state = State.Idle;
        break;
      case State.Armed:
        if (event === Event.fire) this.state = State.Active;
        if (event === Event.disarm) this.state = State.Idle;
        if (event === Event.error) this.state = State.Error;
        break;
      case State.Active:
        if (event === Event.reset) this.state = State.Idle;
        if (event === Event.error) this.state = State.Error;
        break;
      case State.Error:
        if (event === Event.reset) this.state = State.Idle;
        break;
    }
    return this.state;
  }
}

describe('RaptorMini FSM property tests', () => {
  it('matches model over random sequences', () => {
    const arbEvent = fc.constantFrom(Event.arm, Event.fire, Event.reset, Event.disarm, Event.error);
    fc.assert(
      fc.property(fc.array(arbEvent, { minLength: 1, maxLength: 100 }), (events) => {
        let sModel = State.Idle;
        const impl = new RaptorMini();
        for (const e of events) {
          sModel = modelNext(sModel, e);
          const i = impl.handle(e);
          if (sModel !== i) {
            // print diagnostics
            // eslint-disable-next-line no-console
            console.error('Mismatch: model', sModel, 'impl', i, 'events', events);
            return false;
          }
        }
        // invariant: once in Error, only reset returns to non-error
        // Verify: if Error present in model then only reset allowed
        // We can trust the model; just assert impl has no violation
        return true;
      })
    );
  });
});
