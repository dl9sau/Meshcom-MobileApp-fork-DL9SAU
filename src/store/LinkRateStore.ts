import { Store } from "pullstate";

// RECEPTION RATES per node - "of what it sent, how much did we actually get". Two sources,
// both SESSION-ONLY (RAM): neither the Mheard nor the Positions table keeps a history (one
// row per station, INSERT OR REPLACE), so there is nothing to replay after a restart.
//
//   hey - the HEY announcement beacon (D3). Every node sends one every 15 min, FIXED - it
//         is not smart-beaconed and not tied to movement, which makes it the clean link
//         measure: the expected count over a span is known, so what is missing is loss.
//         HEY never reaches the app as a packet, but every RF reception produces an Mheard
//         record naming its packet type, and that is where we read it.
//   pos - position beacons (D4). Same idea, but the interval is NOT dependable (smart
//         beaconing, movement), so it has to be estimated per node - and where it scatters,
//         no percentage is shown at all.
export interface RateInfo {
    got: number;          // beacons we actually received
    expected: number;     // how many the node should have sent in the same span
    intervalMs: number;   // the interval that expectation rests on
    irregular: boolean;   // no dependable interval -> a percentage would be made up
    relayed?: number;     // HEY only: foreign HEYs this node forwarded (relay activity)
}

export interface LinkRateState {
    hey: { [call: string]: RateInfo };
    pos: { [call: string]: RateInfo };
    heyOwn: number;       // totals for MY STATS
    heyRelayed: number;
}

const LinkRateStore = new Store<LinkRateState>({
    hey: {},
    pos: {},
    heyOwn: 0,
    heyRelayed: 0
});

export default LinkRateStore;
