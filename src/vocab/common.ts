/**
 * The remainder vocabulary, for compound splitting.
 *
 * When a listed word turns up inside a longer token, the question is whether
 * the token is a compound ("shitshow") or an innocent word that happens to
 * contain those letters ("Scunthorpe"). The test that separates them: the
 * listed word must sit at a boundary, and **what is left over must itself be
 * a word**.
 *
 *   shitshow   → shit + show    → "show" is a word          → compound
 *   Scunthorpe → s + cunt + …   → "cunt" is not at an edge  → not a compound
 *   class      → cl + ass       → "cl" is not a word        → not a compound
 *   assassin   → ass + assin    → "assin" is not a word     → not a compound
 *
 * **This list is deliberately small, and small is the safety mechanism.** Every
 * word added here is a word that can complete a compound, so a bigger list
 * catches more abuse *and* more innocent words. A full English dictionary
 * would flag "pussycat". These are the ~180 short, concrete nouns that
 * actually show up on the second half of an insult, and nothing else.
 *
 * If you need more coverage for your community's vocabulary, pass your own
 * rather than growing this one — the precision cost is yours to choose.
 */
export const COMPOUND_PARTS: readonly string[] = [
  // body and person
  "head", "face", "eye", "hand", "foot", "hair", "brain", "mouth", "skin",
  "man", "men", "boy", "girl", "kid", "guy", "lad", "wife", "mother", "father",
  "son", "kin", "folk", "people", "baby", "child",
  // containers and objects
  "bag", "box", "can", "pot", "pan", "jar", "cup", "sack", "bucket", "bin",
  "hat", "cap", "coat", "shoe", "sock", "boot", "shirt", "rag", "cloth",
  // places and structures
  "house", "hole", "room", "shop", "yard", "shed", "barn", "hut", "town",
  "land", "field", "farm", "road", "street", "wall", "door", "gate", "floor",
  "roof", "pile", "heap", "dump", "pit",
  // weather and nature
  "storm", "rain", "snow", "wind", "fire", "water", "mud", "dirt", "dust",
  "rock", "stone", "tree", "wood", "weed", "bug", "worm", "rat", "dog", "cat",
  "pig", "goat", "bird", "fish", "snake", "monkey", "donkey",
  // things one does
  "show", "talk", "post", "list", "load", "work", "job", "game", "play",
  "fight", "war", "run", "walk", "kick", "hit", "throw", "spill", "storm",
  // stuff and quality
  "stain", "mess", "junk", "trash", "waste", "muck", "slime", "grease",
  "brain", "wit", "nut", "berry", "cake", "pie", "meat", "milk", "cheese",
  "burger", "sandwich",
  // intensifiers and modifiers that lead a compound
  "dumb", "stupid", "lazy", "smart", "hard", "hot", "cold", "dead", "sick",
  "old", "big", "little", "half", "full", "flat", "dry", "wet", "fat", "thin",
  "bad", "mad", "sad", "sorry", "cheap", "dirty", "filthy", "nasty", "ugly",
  "crazy", "silly", "petty", "total", "utter", "absolute", "complete",
  // and the handful of nouns that lead one
  "bull", "horse", "cow", "sheep", "chicken", "duck", "goose", "mule",
  "jack", "smart", "wise", "rat", "snot", "slob", "clown", "goon", "thug",
];

/**
 * Listed words that are also ordinary English, so they must never be split
 * out of a longer word.
 *
 * `cock` is the whole reason this set exists: it is a rooster, a tap and a
 * hammer mechanism, which makes "cocktail", "cockpit", "cockroach",
 * "peacock" and "shuttlecock" all perfectly innocent compounds. Every other
 * word in the preset is unambiguous enough to split.
 *
 * This is a property of the WORD, not a list of outputs to suppress — which
 * is what keeps it from turning into an endless exceptions file.
 */
export const COMPOUND_HOMOGRAPHS: readonly string[] = ["cock", "prick"];
