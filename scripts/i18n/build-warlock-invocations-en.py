#!/usr/bin/env python3
"""Génère packages/shared/src/warlockInvocations.en.ts depuis le miroir
2014.5e.tools (data/optionalfeatures.json, featureType EI, source PHB).

Même contrat que build-class-features-en.py : texte EN COPIÉ DIRECTEMENT de
5e.tools (entries aplaties via flatten5e), pas traduit. La correspondance
passe par le dictionnaire id catalogue FR → nom EN 5e.tools vérifié.

Le prereq est reconstruit en anglais depuis la structure prerequisite de
5e.tools (level / pact / spell) et préfixé au texte, comme le fait AideDD.
"""
import json
import re
import sys

sys.path.insert(0, 'scripts/i18n')
from flatten5e import flatten

ET = '/tmp/5etools'
OUT = 'packages/shared/src/warlockInvocations.en.ts'

# Traits « Faveur de pacte » (CLASS_FEATURES.Occultiste, MUTEX niveau 3) :
# côté 5e.tools ce sont des optionalfeatures PB — traduits ici, le générateur
# classFeatures les skip explicitement (SKIP_ELSEWHERE).
PACT_BOONS_EN = {
  'occultiste-faveur-lame': 'Pact of the Blade',
  'occultiste-faveur-chaine': 'Pact of the Chain',
  'occultiste-faveur-grimoire': 'Pact of the Tome',
}

# id catalogue FR (warlockInvocations.ts) → nom EN 5e.tools (PHB 2014).
# Vérifié paire par paire contre les noms des 32 optionalfeatures EI/PHB.
INVOCATIONS_EN = {
  'occultiste-invo-armure-d-ombres': 'Armor of Shadows',
  'occultiste-invo-buveuse-de-vie': 'Lifedrinker',
  'occultiste-invo-chaines-des-carceres': 'Chains of Carceri',
  'occultiste-invo-decharge-dechirante': 'Agonizing Blast',
  'occultiste-invo-decharge-repulsive': 'Repelling Blast',
  'occultiste-invo-lance-occulte': 'Eldritch Spear',
  'occultiste-invo-langage-animal': 'Beast Speech',
  'occultiste-invo-lame-assoiffee': 'Thirsting Blade',
  'occultiste-invo-lenteur-de-l-esprit': 'Mire the Mind',
  'occultiste-invo-livre-des-secrets-anciens': 'Book of Ancient Secrets',
  'occultiste-invo-maitre-des-formes': 'Master of Myriad Forms',
  'occultiste-invo-maitre-des-ombres': 'One with Shadows',
  'occultiste-invo-mille-visages': 'Mask of Many Faces',
  'occultiste-invo-mot-d-effroi': 'Dreadful Word',
  'occultiste-invo-murmures-de-la-tombe': 'Whispers of the Grave',
  'occultiste-invo-murmures-ensorcelants': 'Bewitching Whispers',
  'occultiste-invo-oeil-du-gardien-des-runes': 'Eyes of the Rune Keeper',
  'occultiste-invo-pas-aerien': 'Ascendant Step',
  'occultiste-invo-perception-transferee': 'Gaze of Two Minds',
  'occultiste-invo-presence-captivante': 'Beguiling Influence',
  'occultiste-invo-royaumes-lointains': 'Visions of Distant Realms',
  'occultiste-invo-saut-d-outremonde': 'Otherworldly Leap',
  'occultiste-invo-sbires-du-chaos': 'Minions of Chaos',
  'occultiste-invo-sculpteur-de-chair': 'Sculptor of Flesh',
  'occultiste-invo-sombre-presage': 'Sign of Ill Omen',
  'occultiste-invo-vigueur-fielonne': 'Fiendish Vigor',
  'occultiste-invo-vision-de-sorcier': 'Witch Sight',
  'occultiste-invo-vision-du-diable': "Devil's Sight",
  'occultiste-invo-vision-occulte': 'Eldritch Sight',
  'occultiste-invo-visions-embrumees': 'Misty Visions',
  'occultiste-invo-voix-du-maitre-des-chaines': 'Voice of the Chain Master',
  'occultiste-invo-voleur-des-cinq-destinees': 'Thief of Five Fates',
}

PACT_EN = {'Blade': 'the Blade', 'Chain': 'the Chain', 'Tome': 'the Tome'}


def prereq_text(pre):
  """Reconstruit le libellé « Prerequisite: … » depuis la structure 5e.tools."""
  if not pre:
    return ''
  parts = []
  for item in pre:
    if 'level' in item:
      lvl = item['level']['level']
      parts.append(f'{lvl}th level' if lvl != 1 else '1st level')
    elif 'pact' in item:
      parts.append(f'Pact of {PACT_EN[item["pact"]]} feature')
    elif 'spell' in item:
      name = item['spell'][0].split('#')[0]
      parts.append(f'{name} cantrip')
  return f'Prerequisite: {", ".join(parts)}\n\n' if parts else ''


def main():
  opt = json.load(open(f'{ET}/data/optionalfeatures.json'))
  by_name = {}
  for o in opt.get('optionalfeature', []):
    if o.get('featureType') == ['EI'] or o.get('featureType') == ['PB']:
      by_name.setdefault(o['name'], o)

  out, errors = {}, []
  for fid, en_name in list(INVOCATIONS_EN.items()) + list(PACT_BOONS_EN.items()):
    o = by_name.get(en_name)
    if o is None:
      errors.append(f'« {en_name} » introuvable dans optionalfeatures (EI) — {fid}')
      continue
    if o.get('source') != 'PHB':
      errors.append(f'« {en_name} » source {o.get("source")} != PHB — {fid}')
      continue
    if o.get('featureType') != ['EI'] and fid not in PACT_BOONS_EN:
      errors.append(f'« {en_name} » n’est pas une EI — {fid}')
      continue
    text = flatten(o.get('entries', [])).strip()
    out[fid] = {'name': en_name, 'description': prereq_text(o.get('prerequisite')) + text}

  if errors:
    print(f'{len(errors)} erreurs :')
    for e in errors:
      print(' ', e)
    return 1

  with open(OUT, 'w') as f:
    f.write('// GÉNÉRÉ par scripts/i18n/build-warlock-invocations-en.py — ne pas éditer à la main.\n')
    f.write('// Source : miroir GitHub de 2014.5e.tools (optionalfeatures.json, EI/PHB).\n\n')
    f.write('export const WARLOCK_INVOCATIONS_EN: Record<string, { name: string; description: string }> = ')
    f.write(json.dumps(out, ensure_ascii=False, indent=2))
    f.write(';\n')

  print(f'OK : {len(out)} manifestations EN écrites dans {OUT}')
  return 0


if __name__ == '__main__':
  sys.exit(main())
