/**
 * A page's name as the menu and its heading show it: the first letter of every word capital ("get involved" ->
 * "Get Involved"), whatever case a committee typed it in Settings -> Modules. Pure and import-free, so it is checked
 * on its own (tests/title-case.test.mjs).
 *
 * Only the first letter is touched and the rest is left as typed, so "UPI" and "NGO" survive; a word that already
 * has a capital inside it ("iPhone", "eKYC") is somebody's deliberate spelling and is left alone entirely.
 * Words are split on spaces only, so "Walk-in" stays as typed. Applied where a name is shown, never to what is
 * stored: the Settings field still holds exactly what the admin typed.
 */
export function titleCase(value: string): string {
  return value.replace(/\S+/g, (word) => {
    if (/\p{Lu}/u.test(word.slice(1))) return word;
    // The first letter of the word, after any opening punctuation ("(optional)"), but never past a digit ("2nd").
    return word.replace(/^([^\p{L}\p{N}]*)(\p{Ll})/u, (_, lead: string, first: string) => lead + first.toUpperCase());
  });
}
