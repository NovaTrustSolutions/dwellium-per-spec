/**
 * DEMO_BOARD — a complete worked example so the widget is useful on first open.
 *
 * The decision is a real Dwellium-shaped one (Georgia multifamily renewal
 * pricing at Woodland Parc Townhomes). It is clearly labelled as an EXAMPLE in
 * the UI and is never written to the per-user store.
 */
import type { AdvisoryBoardSession } from './types';

export const DEMO_SESSION_ID = 'demo-woodland-parc-renewals';

export const DEMO_BOARD: AdvisoryBoardSession = {
    id: DEMO_SESSION_ID,
    topic: 'Raise renewal rents 6% across Woodland Parc Townhomes, or hold at 3% to protect occupancy?',
    questions: [
        'What outcome would make this a good decision?',
        'What evidence do you have already?',
        'What constraint cannot be ignored?',
    ],
    answers: [
        'Twelve months from now: net collected rent per unit is up, occupancy is still 94%+, and turn costs have not eaten the increase.',
        'Two comparable townhome communities within three miles renewed at 5–7% this spring. Our last renewal cycle at 3% held 91% renewal acceptance. Turn cost per unit ran $2,150 average, and units sat 19 days.',
        'The 2027 refinance is underwritten on trailing-12 net collections, and we manage turns with a two-person in-house crew that is already at capacity in summer.',
    ],
    skipped: false,
    lensNotes: {},
    updatedAt: 0,
    result: {
        decision: 'Price renewals by unit rather than by community: 6% where the market and the resident support it, 3% where turn risk or payment history says otherwise.',
        contextRead:
            'Stage: execution / risk review, not exploration. Woodland Parc is stabilised, comps renewed at 5–7%, and last cycle\'s 3% held 91% renewal acceptance. The binding constraints are operational, not market: a two-person turn crew already saturated in summer, $2,150 average turn cost, and 19 days of vacancy per turn. A flat 6% across every unit is a pricing decision that is really a capacity decision — each renewal lost costs roughly $2,150 plus 19 days of rent, which swamps the incremental 3% on that unit for most of a year. The 2027 refinance is underwritten on trailing-12 net collections, so what matters is collected rent, not asking rent.',
        views: [
            {
                lensId: 'clarity',
                view: 'A single community-wide number is easy to explain to residents and easy for the team to execute. "6% everywhere" and "3% everywhere" are both clear; a per-unit matrix is not, unless it is reduced to two or three named tiers.',
                blindSpot: 'Clarity can be bought at the price of accuracy — a clean number that ignores which units can bear it is simple and wrong. Simplicity in the resident letter is not the same as simplicity in the pricing model.',
                recommendation: 'Ship at most three renewal tiers with plain names and one sentence of reasoning each. If the tiering cannot be explained to a resident in two lines, it is too complicated to run.',
            },
            {
                lensId: 'risk',
                view: 'The downside is asymmetric. A 6% increase on a $1,700 unit adds about $1,224 over twelve months; losing that resident costs $2,150 in turn plus roughly $1,076 of vacancy — a net loss for most of the year even if the replacement pays the higher rent.',
                blindSpot: 'The 91% acceptance at 3% is not evidence that 6% also holds; it is evidence about 3%. Comps renewing at 5–7% are asking rents, and the outcome data on them is not in hand.',
                recommendation: 'Set the increase so that expected net collections beat the hold case even if renewal acceptance drops ten points. Cap total exposure by staging increases across the year rather than raising every lease at once.',
            },
            {
                lensId: 'scale',
                view: 'The real bottleneck is the two-person turn crew at summer capacity. Any pricing decision that raises turns above what the crew can absorb converts revenue upside into vacancy days and overtime.',
                blindSpot: 'This lens will want a mechanism — a renewal scoring model — before the data supports one. There is one cycle of acceptance data at one price point; that is not enough to fit a model to.',
                recommendation: 'Sequence renewals so no more than the crew\'s weekly turn capacity comes due at once, and instrument this cycle: log offer, acceptance, days-to-decision, and turn cost per unit so the second cycle has real evidence.',
            },
            {
                lensId: 'offer',
                view: 'The renewal offer today is a price with nothing attached. Residents compare it to a number down the road. Attaching something the resident actually wants — a longer term, a small unit improvement, a fixed renewal date — makes 6% easier to accept than 6% alone.',
                blindSpot: 'Concessions can quietly give back the whole increase. A $400 improvement against a $1,224 annual gain is a third of the upside, and it recurs every cycle once residents expect it.',
                recommendation: 'Offer 6% on an 18-month term and 3% on a 12-month, priced so the longer term is the better deal for both sides. Do not manufacture urgency or deadlines that will not be enforced.',
            },
            {
                lensId: 'future-self',
                view: 'The regret that lasts is not a percentage point of rent. It is becoming an operator known for squeezing renewals to the edge, in a market where reputation compounds through referrals and reviews for years.',
                blindSpot: 'The mirror image is real too — chronic under-pricing "to be the good landlord" is avoidance dressed as decency, and it shows up as a weaker refinance and deferred maintenance the residents pay for later.',
                recommendation: 'Take the increase, and pair it with something visible that residents get for it. Judge the decision a year out by whether residents renewed again, not by the size of the first increase.',
            },
        ],
        disagreement:
            'Four of the five lenses accept an increase; they disagree on shape and size. Offer Strength wants the boldest number and will trade concessions to get the yes — which Risk and Capital reads as giving back the gain while adding term risk. Risk and Capital wants the increase sized to survive a ten-point drop in acceptance, which Offer Strength reads as leaving money on the table against comps at 5–7%. Scale and Systems is the lens that most directly challenges a flat 6%: the constraint is turn capacity, not willingness to pay, and it wants sequencing and instrumentation before any model — but it is over-weighting mechanism on one cycle of data. Product Clarity pushes against everyone by insisting the answer be explainable in two lines, and may be over-weighting neatness over per-unit accuracy. Future Self is the only lens weighing reputation, and it may be under-weighting the 2027 refinance pressure that makes this cycle matter more than an average one.',
        futureSelfCheck:
            'The likely regret is not "we asked for 6%." It is running a cycle with no instrumentation — raising rents, losing some residents, and arriving at the next cycle with no better idea of what the portfolio can bear than today. The second regret is a summer where turns outran the crew and residents saw a rent increase alongside slower maintenance, which is exactly the trade that damages a small operator\'s reputation.',
        brief: {
            decision: 'Two renewal tiers: 6% on an 18-month term for units at or below market with clean payment history; 3% on a 12-month term everywhere else. No flat community-wide number.',
            why: 'The evidence supports an increase — comps renewed at 5–7% and 3% cleared at 91% acceptance — but the binding constraint is turn capacity, and one lost renewal costs more than a year of the extra 3% on that unit. Tiering captures the upside where it is safe and protects occupancy where it is not.',
            risk: 'Acceptance on the 6% tier could fall well below 91%, and turns could stack into the summer window where the two-person crew is already saturated, converting the rent gain into vacancy days and overtime.',
            nextAction: 'This week, pull the rent roll and tag every lease expiring in the next 120 days as Tier A (6% / 18-month) or Tier B (3% / 12-month) using market position and payment history. Cap Tier A offers going out in any week at the crew\'s turn capacity, and log offer, acceptance, and days-to-decision for every one.',
            doNotDo: 'Do not send a flat 6% to the whole community, and do not add cash or improvement concessions to rescue an offer a resident has already declined — that trains the next cycle to negotiate.',
        },
        raw: '',
        unparsed: false,
    },
};
