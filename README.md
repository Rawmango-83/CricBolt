Backend for authoritative ranked actions.

Exports:
- `rankedMarkReady`
- `rankedSubmitMove`
- `rankedForfeit`
- `rankedEnforceTimeout`

Deploy steps (from project root, after Firebase CLI setup):

1. Install dependencies
`cd functions && npm install`

2. Deploy functions
`firebase deploy --only functions`

3. Deploy Firestore rules
`firebase deploy --only firestore:rules`

Notes:
- The client has fallback transaction paths for local/dev testing.
- In production, keep Firestore room updates locked (as in `firestore.rules`) and rely on callable functions.
