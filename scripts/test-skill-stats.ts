/**
 * Sanity checks for expertise (double proficiency bonus): skillProficiencyLevel,
 * skillModifier, expertiseSlots, passivePerception, renderFeatureTemplate.
 * Run: npm run test-skill-stats
 */
import {
  type Character,
  expertiseSlots,
  passivePerception,
  renderFeatureTemplate,
  skillModifier,
  skillProficiencyLevel,
} from '@dnd-inventory/shared';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(
      `✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  } else {
    console.log(`✓ ${label}`);
  }
}

const mkChar = (over: Partial<Character>): Character => ({
  id: 1,
  partyId: 1,
  ownerId: 1,
  ownerName: '',
  name: 'Test',
  strength: 10,
  capacityMultiplier: 1,
  exhaustion: 0,
  conditions: [],
  foodDays: 0,
  waterDays: 0,
  maxHp: 10,
  currentHp: 10,
  tempHp: 0,
  level: 1,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  characterClass: 'Guerrier',
  race: null,
  background: null,
  speed: 9,
  skillProficiencies: [],
  skillExpertise: [],
  savingThrowProficiencies: [],
  weaponProficiencies: null,
  spellSlotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  alignment: null,
  sex: null,
  height: null,
  weight: null,
  age: null,
  skin: null,
  eyes: null,
  hair: null,
  portraitUrl: null,
  personalityTraits: null,
  ideals: null,
  bonds: null,
  flaws: null,
  appearance: null,
  armorClassOverride: null,
  deathSaveSuccesses: 0,
  deathSaveFailures: 0,
  inspiration: false,
  concentrating: false,
  hidden: false,
  notes: null,
  copper: 0,
  silver: 0,
  electrum: 0,
  gold: 0,
  platinum: 0,
  createdAt: '',
  ...over,
});

// --- skillProficiencyLevel: precedence ---
check('aucune maîtrise → 0', skillProficiencyLevel(mkChar({}), 'stealth'), 0);
check(
  'maîtrise simple → 1',
  skillProficiencyLevel(mkChar({ skillProficiencies: ['stealth'] }), 'stealth'),
  1,
);
check(
  'expertise → 2',
  skillProficiencyLevel(
    mkChar({ skillProficiencies: ['stealth'], skillExpertise: ['stealth'] }),
    'stealth',
  ),
  2,
);
check(
  'expertise sans entrée de maîtrise → 2 (l’expertise implique la maîtrise)',
  skillProficiencyLevel(mkChar({ skillExpertise: ['stealth'] }), 'stealth'),
  2,
);
check(
  'autre compétence non touchée',
  skillProficiencyLevel(mkChar({ skillProficiencies: ['stealth'] }), 'athletics'),
  0,
);

// --- skillModifier: ability + prof×niveau ---
const roublard1 = mkChar({
  characterClass: 'Roublard',
  level: 1,
  dexterity: 16, // mod +3, bonus de maîtrise +2
  skillProficiencies: ['stealth', 'acrobatics'],
});
check('Roublard niv 1, Discrétion maîtrisée → +5', skillModifier(roublard1, 'stealth'), 5);
check(
  'Roublard niv 1, Escamotage non maîtrisée → +3',
  skillModifier(roublard1, 'sleightOfHand'),
  3,
);
check(
  'Roublard niv 1, Discrétion expertise → +7 (2×2+3)',
  skillModifier({ ...roublard1, skillExpertise: ['stealth'] }, 'stealth'),
  7,
);
const roublard17 = mkChar({
  characterClass: 'Roublard',
  level: 17, // bonus de maîtrise +6
  dexterity: 16,
  skillProficiencies: ['stealth'],
  skillExpertise: ['stealth'],
});
check('Roublard niv 17, expertise → +15 (3+6×2)', skillModifier(roublard17, 'stealth'), 15);
const clerc5 = mkChar({
  characterClass: 'Clerc',
  level: 5, // bonus de maîtrise +3
  wisdom: 14, // mod +2
  skillProficiencies: ['perception'],
  skillExpertise: ['perception'],
});
check('Clerc niv 5, Perception expertise → +8 (2+3×2)', skillModifier(clerc5, 'perception'), 8);

// --- expertiseSlots (SRD : Roublard 1/6, Barde 3/10, Clerc Savoir 1) ---
check('Roublard niv 1 → 2', expertiseSlots(mkChar({ characterClass: 'Roublard', level: 1 })), 2);
check('Roublard niv 5 → 2', expertiseSlots(mkChar({ characterClass: 'Roublard', level: 5 })), 2);
check('Roublard niv 6 → 4', expertiseSlots(mkChar({ characterClass: 'Roublard', level: 6 })), 4);
check('Roublard niv 20 → 4', expertiseSlots(mkChar({ characterClass: 'Roublard', level: 20 })), 4);
check('Barde niv 2 → 0', expertiseSlots(mkChar({ characterClass: 'Barde', level: 2 })), 0);
check('Barde niv 3 → 2', expertiseSlots(mkChar({ characterClass: 'Barde', level: 3 })), 2);
check('Barde niv 9 → 2', expertiseSlots(mkChar({ characterClass: 'Barde', level: 9 })), 2);
check('Barde niv 10 → 4', expertiseSlots(mkChar({ characterClass: 'Barde', level: 10 })), 4);
check(
  'Clerc Savoir niv 1 → 2',
  expertiseSlots(mkChar({ characterClass: 'Clerc', level: 1, divineDomain: 'savoir' })),
  2,
);
check(
  'Clerc Vie → 0',
  expertiseSlots(mkChar({ characterClass: 'Clerc', level: 5, divineDomain: 'vie' })),
  0,
);
check('Clerc sans domaine → 0', expertiseSlots(mkChar({ characterClass: 'Clerc', level: 5 })), 0);
check('Guerrier → 0', expertiseSlots(mkChar({ characterClass: 'Guerrier', level: 20 })), 0);
check('Sans classe → 0', expertiseSlots(mkChar({ level: 10 })), 0);
check(
  'classe insensible à la casse/accents → 2',
  expertiseSlots(mkChar({ characterClass: 'roublard', level: 1 })),
  2,
);

// --- passivePerception : l’expertise double le bonus ---
check('perception passive sans maîtrise', passivePerception(2, 3, 0), 12);
check('perception passive maîtrisée', passivePerception(2, 3, 1), 15);
check('perception passive expertise', passivePerception(2, 3, 2), 18);

// --- renderFeatureTemplate : variables {{skill:*}} et passive_perception ---
const expert = mkChar({
  characterClass: 'Roublard',
  level: 5, // bonus de maîtrise +3
  dexterity: 16, // +3
  wisdom: 14, // +2
  skillProficiencies: ['stealth', 'perception'],
  skillExpertise: ['stealth', 'perception'],
});
check(
  '{{skill:stealth}} reflète l’expertise (+9)',
  renderFeatureTemplate('{{skill:stealth}}', expert),
  '+9',
);
check(
  '{{passive_perception}} reflète l’expertise (18)',
  renderFeatureTemplate('{{passive_perception}}', expert),
  '18',
);
const proficientOnly = { ...expert, skillExpertise: [] as string[] };
check(
  '{{skill:stealth}} maîtrise simple (+6)',
  renderFeatureTemplate('{{skill:stealth}}', proficientOnly),
  '+6',
);
check(
  '{{passive_perception}} maîtrise simple (15)',
  renderFeatureTemplate('{{passive_perception}}', proficientOnly),
  '15',
);

console.log(failures === 0 ? '✅ Tous les tests d’expertise passent' : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
