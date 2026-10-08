/**
 * Whether anybody may start a new society.
 *
 * **Closed until society registration ships.** With it open, any signed-in
 * person could create "TRU Wind Chimes" beside the real "TRU WindChimes" and
 * become its admin; there is no verification step yet to tell them apart. While
 * it is closed:
 *
 *  - no society can be created (`POST ?resource=societies` answers 403);
 *  - an event can only be created inside a society the person is **already an
 *    admin or committee member of** (the rule `create_event_draft` has always
 *    enforced), so for now that means TRU WindChimes' committee;
 *  - the Create-event form shows that society, fixed, and no "new society" option.
 *
 * One constant, shared by the server and the form, so the two cannot disagree.
 * Opening it is the society-registration release, not a config tweak.
 */
export const SOCIETY_REGISTRATION_OPEN = false;

export const societyRegistrationClosedMessage =
  "New societies cannot be registered yet. Events can be created by the committee of an existing society.";
