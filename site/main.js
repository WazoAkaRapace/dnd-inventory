// Site marketing — Table Sync
// 0) la langue du site (FR par défaut · EN au choix)
// 1) la démo temps réel (le MD frappe, l'étincelle court le fil, la fiche répond)
// 2) les entrées du registre se posent une fois (register-rise), les
//    ordinaux et les preuves se tamponnent, les mesures comptent
// 3) la marge du registre (≥1360px) : le fil de lecture descend au fil du
//    scroll ; la bande du tour (<1360px) porte le tour courant + « tour suivant »
//    (styles.css porte en parallèle la couche scrubbée scroll-driven)
// 4) copier les commandes d'auto-hébergement
//
// ----- Langue : mécanisme retenu -----
// Le HTML porte des PAIRES d'éléments [lang="fr"]/[lang="en"] ; styles.css
// masque la langue inactive selon <html lang>. Choix retenu (plutôt que des
// data-attributs échangés par JS) : la page reste intégralement lisible en
// français sans JS, chaque langue garde sa ponctuation et ses entités
// propres, et les lecteurs d'écran prononcent l'anglais avec la bonne voix.
// La langue est posée AVANT le premier rendu par le script inline de <head>
// (localStorage « site-lang », clé distincte de l'app, ou ?lang=en partageable).
// Ce module gère le reste : bascule FR|EN, attributs (alt, aria-label),
// captures EN (assets/screenshots-en/), légendes des postes, <title>/meta
// et les chaînes pilotées par JS (démo, bande du tour, bouton copier).

(() => {
  // Le JS s'annonce : sans lui, .reveal reste visible (le contenu ne se cache jamais par défaut)
  document.documentElement.classList.add('js');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Langue du site ---------- */

  const LANG_KEY = 'site-lang';
  let lang = document.documentElement.lang === 'en' ? 'en' : 'fr';

  const STRINGS = {
    fr: {
      title: 'Table Sync — le compagnon de campagne partagé, pour le MD et les joueurs',
      description:
        'Table Sync — le compagnon de campagne partagé, pour le MD et les joueurs. Fiches, inventaire en kg et combat D&D 5e, 100 % français, synchronisés en temps réel. Auto-hébergé.',
      hpReadGm: (hpNow) => `Lyra · ${hpNow}/${MAX_HP} PV`,
      hpReadPlayer: (hpNow) => `${hpNow}/${MAX_HP} PV`,
      hpValueText: (hpNow) => `${hpNow} sur ${MAX_HP} points de vie`,
      copyIdle: 'Copier',
      copyOk: 'Copié ✓',
      copyFail: 'Copie impossible',
      tocLabel: 'Le registre',
      turnLabel: 'Le tour en cours',
      turnNext: 'Tour suivant',
      turnAria: (title) => `Tour en cours : ${title} — passer au tour suivant`,
    },
    en: {
      title: 'Table Sync — the shared campaign companion, for the GM and the players',
      description:
        'Table Sync — the shared campaign companion, for the GM and the players. Character sheets, kilogram-based inventory and D&D 5e combat, synced in real time. Self-hosted.',
      hpReadGm: (hpNow) => `Lyra · ${hpNow}/${MAX_HP} HP`,
      hpReadPlayer: (hpNow) => `${hpNow}/${MAX_HP} HP`,
      hpValueText: (hpNow) => `${hpNow} of ${MAX_HP} hit points`,
      copyIdle: 'Copy',
      copyOk: 'Copied ✓',
      copyFail: 'Copy failed',
      tocLabel: 'The register',
      turnLabel: 'The current turn',
      turnNext: 'Next turn',
      turnAria: (title) => `Current turn: ${title} — skip to the next turn`,
    },
  };

  const SHOT_DIR = { fr: 'assets/screenshots/', en: 'assets/screenshots-en/' };

  // Attributs bilingues : la valeur FR vit dans l'attribut réel, la valeur EN
  // dans data-en-*. Le premier échange recopie l'original dans data-fr-* pour
  // pouvoir revenir en arrière sans dérive.
  const ATTR_SWAPS = [
    { selector: '[data-en-alt]', attr: 'alt', fr: 'data-fr-alt', en: 'data-en-alt' },
    {
      selector: '[data-en-aria-label]',
      attr: 'aria-label',
      fr: 'data-fr-aria-label',
      en: 'data-en-aria-label',
    },
  ];

  const captionFor = (pill) =>
    lang === 'en'
      ? (pill.dataset.enCaption ?? pill.dataset.caption ?? '')
      : (pill.dataset.caption ?? '');

  const applyToggle = () => {
    document.querySelectorAll('.lang-toggle [data-lang]').forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  const applyAttrs = () => {
    for (const swap of ATTR_SWAPS) {
      document.querySelectorAll(swap.selector).forEach((el) => {
        if (!el.hasAttribute(swap.fr)) {
          el.setAttribute(swap.fr, el.getAttribute(swap.attr) ?? '');
        }
        el.setAttribute(swap.attr, el.getAttribute(lang === 'en' ? swap.en : swap.fr) ?? '');
      });
    }
  };

  // Les captures EN vivent en assets/screenshots-en/<même nom> (copiées au
  // déploiement depuis docs/screenshots-en/) — un seul <img> par vue, le src
  // est échangé, jamais le DOM dupliqué. La fenêtre bureau (.deskframe) suit
  // le même échange que les cadres téléphone et portrait.
  const applyShots = () => {
    document
      .querySelectorAll('.shot-frame img, .portrait-frame img, .deskframe img')
      .forEach((img) => {
        const src = img.getAttribute('src') ?? '';
        const name = src.split('/').pop();
        if (src.startsWith('assets/screenshots')) {
          const next = SHOT_DIR[lang] + name;
          if (next !== src) {
            img.setAttribute('src', next);
          }
        }
      });
    // la visionneuse, si elle vient d'être ouverte, suit la langue active
    if (viewerImg) {
      viewerImg.src = viewerImg.src.replace(
        /\/assets\/screenshots(-en)?\//,
        `/assets/${lang === 'en' ? 'screenshots-en' : 'screenshots'}/`,
      );
    }
  };

  const applyCaptions = () => {
    document.querySelectorAll('.phonepost').forEach((post) => {
      const caption = post.querySelector('.phonepost-caption');
      const active = post.querySelector('.phonepost-dock button.is-active');
      if (caption && active) {
        caption.textContent = captionFor(active);
      }
    });
  };

  const applyStrings = () => {
    document.title = STRINGS[lang].title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', STRINGS[lang].description);
  };

  // La marge du registre et la bande du tour (bâties plus bas) se localisent
  // comme le reste : aria-labels, infobulles des ordinaux, titre du tour
  let marginTocNav = null;
  let turnband = null;

  // Les réservations de hauteur des voix larges se recalculent à la bascule
  // de langue (les paragraphes n'ont pas la même longueur en FR et en EN)
  const voiceMeasures = [];

  function applyLang(next, { persist = false } = {}) {
    lang = next === 'en' ? 'en' : 'fr';
    document.documentElement.lang = lang;
    if (persist) {
      try {
        window.localStorage.setItem(LANG_KEY, lang);
      } catch {
        /* stockage indisponible — la préférence ne survivra pas au rechargement */
      }
    }
    applyToggle();
    applyAttrs();
    applyShots();
    applyCaptions();
    applyStrings();
    if (copyBtn && Date.now() >= copyFlashUntil) {
      copyBtn.textContent = STRINGS[lang].copyIdle;
    }
    localizeDemo();
    if (marginTocNav) {
      marginTocNav.setAttribute('aria-label', STRINGS[lang].tocLabel);
      marginTocNav.querySelectorAll('.toc-entry').forEach((link) => {
        const fr = link.dataset.tocTitleFr ?? '';
        const en = link.dataset.tocTitleEn ?? fr;
        const label = link.querySelector('.toc-label')?.textContent ?? '';
        const title = lang === 'en' ? en : fr;
        // la chip survolée et le nom accessible suivent la langue active
        if (title) {
          link.dataset.tocTitle = title;
          link.setAttribute('aria-label', `${label} — ${title}`);
        }
      });
    }
    if (turnband) {
      localizeTurnband();
    }
    for (const remeasure of voiceMeasures) {
      remeasure();
    }
  }

  /* ---------- Démo temps réel ---------- */

  const MAX_HP = 31;
  const DAMAGE = 9;

  const demo = document.querySelector('.demo');
  const strikeBtn = document.querySelector('[data-strike]');
  const reads = demo?.querySelectorAll('[data-hp-read]');
  const bars = demo?.querySelectorAll('[data-hp-bar]');
  const fills = demo?.querySelectorAll('[data-hp-fill]');
  const chip = demo?.querySelector('[data-chip]');
  const conc = demo?.querySelector('[data-conc]');
  const spark = demo?.querySelector('.wire .spark');
  const wire = demo?.querySelector('.wire');
  let hp = MAX_HP;
  let strikeTimer = null;

  const tierOf = (hpNow) => {
    if (hpNow <= Math.ceil(MAX_HP * 0.25)) return 'crit';
    if (hpNow <= Math.ceil(MAX_HP * 0.5)) return 'low';
    return 'ok';
  };

  const render = (hpNow) => {
    const pct = Math.round((hpNow / MAX_HP) * 100);
    const tier = tierOf(hpNow);
    reads?.forEach((read) => {
      read.textContent = read.textContent.includes('Lyra')
        ? STRINGS[lang].hpReadGm(hpNow)
        : STRINGS[lang].hpReadPlayer(hpNow);
    });
    bars?.forEach((bar) => {
      bar.setAttribute('aria-valuenow', String(hpNow));
      bar.setAttribute('aria-valuetext', STRINGS[lang].hpValueText(hpNow));
    });
    fills?.forEach((fill) => {
      fill.style.width = `${pct}%`;
      if (tier === 'ok') {
        fill.removeAttribute('data-tier');
      } else {
        fill.setAttribute('data-tier', tier);
      }
    });
  };

  // Traduit l'état statique de la démo sans rejouer la séquence : la valeur
  // affichée (aria-valuenow) fait foi, pas le compteur interne (prêt à frapper).
  function localizeDemo() {
    if (!demo) return;
    const bar = demo.querySelector('[data-hp-bar]');
    const shown = Number.parseInt(bar?.getAttribute('aria-valuenow') ?? String(hp), 10);
    render(Number.isNaN(shown) ? hp : shown);
  }

  const strike = () => {
    if (!demo || strikeTimer) return; // une frappe à la fois
    const hit = Math.max(0, hp - DAMAGE);
    chip?.classList.add('is-visible');
    // l'étincelle part du traqueur et court le fil jusqu'à la fiche — la
    // distance exacte du fil, posée au coup plutôt qu'au rendu (responsive)
    if (spark && wire && !reduceMotion) {
      spark.style.setProperty('--travel', `${Math.max(24, wire.offsetWidth - 9)}px`);
      spark.classList.add('is-running');
    }
    window.setTimeout(() => {
      hp = hit;
      render(hp);
      conc?.classList.add('is-visible');
    }, 450);
    strikeTimer = window.setTimeout(() => {
      // la séance continue : Lyra se soigne, la démo se réarme
      chip?.classList.remove('is-visible');
      conc?.classList.remove('is-visible');
      spark?.classList.remove('is-running');
      window.setTimeout(() => {
        hp = MAX_HP;
        render(hp);
        strikeTimer = null;
      }, 500);
    }, 3400);
  };

  const armDemo = () => {
    // Première frappe offerte quand la démo entre à l'écran
    if (!('IntersectionObserver' in window)) return;
    let seen = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !seen) {
            seen = true;
            window.setTimeout(strike, 700);
            io.disconnect();
          }
        }
      },
      { threshold: 0.6 },
    );
    io.observe(demo);
  };

  if (demo && strikeBtn) {
    strikeBtn.addEventListener('click', strike);
    if (reduceMotion) {
      // État final statique : la frappe a eu lieu, tout est lisible
      hp = MAX_HP - DAMAGE;
      render(hp);
      chip?.classList.add('is-visible');
      conc?.classList.add('is-visible');
    } else {
      armDemo();
    }
  }

  /* ---------- Le tampon des ordinaux ---------- */

  // Cadence des travaux liés au scroll : un rAF par défilement, AVEC filet
  // de secours. Dans un panneau intégré sans focus (navigateur embarqué,
  // onglet en arrière-plan), le rAF peut être étranglé — et un verrou
  // booléen « en attente » gèlerait le dispositif POUR DE BON si une seule
  // trame était perdue : le minuteur reprend alors la main.
  const frameGuarded = (work) => {
    let raf = 0;
    return () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        work();
      });
      window.setTimeout(() => {
        if (raf) {
          window.cancelAnimationFrame(raf);
          raf = 0;
          work();
        }
      }, 160);
    };
  };

  // L'ordinal tamponne quand il franchit la ligne des 42 % du viewport —
  // APRÈS l'encre du titre (achevée vers 45 %) : la plume écrit la ligne,
  // puis le sceau frappe. Un simple observateur manquerait les sauts
  // (ancre, fil de lecture, molette vive) et laisserait l'ordinal invisible ;
  // la ligne, elle, rattrape tout ce qui la dépasse. Déclenché une fois :
  // l'encre sèche, remonter ne l'efface pas.
  // (La couche scrubbée de styles.css s'occupe du filet et de l'encre du
  // titre ; le tampon, lui, reste un impact déclenché.)
  const ordinals = [...document.querySelectorAll('.entry-ordinal')];
  const stampPassedOrdinals = () => {
    const line = window.scrollY + window.innerHeight * 0.42;
    for (const ordinal of ordinals) {
      if (!ordinal.classList.contains('is-stamped')) {
        if (ordinal.getBoundingClientRect().top + window.scrollY <= line) {
          ordinal.classList.add('is-stamped');
        }
      }
    }
  };

  if (reduceMotion) {
    ordinals.forEach((ordinal) => {
      ordinal.classList.add('is-stamped');
    });
  } else {
    window.addEventListener('scroll', frameGuarded(stampPassedOrdinals), {
      passive: true,
    });
    window.addEventListener('resize', stampPassedOrdinals);
    stampPassedOrdinals();
  }

  /* ---------- Poste de consultation (séries de captures = histoires) ----------
     Chaque poste est câblé indépendamment. En histoire épinglée (scroll
     vivant, mouvement non réduit), le téléphone prend la hauteur de l'écran
     et le DÉFILEMENT avance les vues une à une : la page reste captive
     jusqu'à la dernière vue. Les pilules naviguent toujours — elles mènent
     le défilement à la vue choisie. En repli (mouvement réduit, vieux
     moteur), les pilules basculent les vues directement, sans épingler. */

  document.querySelectorAll('.phonepost').forEach((post) => {
    const views = [...post.querySelectorAll('.phonepost-view')];
    const pills = [...post.querySelectorAll('.phonepost-dock button')];
    const caption = post.querySelector('.phonepost-caption');
    const track = post.querySelector('.story-track');
    const count = views.length;
    if (count === 0) return;

    // Le rail : un segment par vue, son remplissage suit le doigt
    const segs = [];
    if (track) {
      for (let i = 0; i < count; i++) {
        const seg = document.createElement('div');
        seg.className = 'story-seg';
        const fill = document.createElement('i');
        seg.append(fill);
        track.append(seg);
        segs.push(fill);
      }
    }

    /* ----- La voix suit l'écran -----
       Le texte de la section vit en sync avec la capture affichée :
       - la NARRATION (story-side) montre la sous-entrée correspondant à
         la vue courante — h3 et paragraphe CLONÉS depuis la copie feuille
         (les paires [lang] voyagent avec, la bascule FR|EN marche seule) ;
       - la COPIE FEUILLE marque la sous-entrée courante (.is-current,
         encre pleine + dé or) et estompe les autres (.is-sync-dim) —
         l'emphase voyage vue après vue. data-story-view porte la
         correspondance (une sous-entrée peut posséder plusieurs vues,
         p. ex. « Survie & forme sauvage » couvre deux écrans).
       Vue sans correspondance : l'emphase reste sur la précédente. */
    const entryEl = post.closest('.entry');
    // une entrée peut porter DEUX histoires (téléphone + large) : la
    // correspondance texte↔vues de l'histoire large vit dans data-wide-view,
    // celle du poste téléphone dans data-story-view — jamais les mêmes
    // indices, jamais la même emphase
    const dataKey = post.classList.contains('story--wide') ? 'wideView' : 'storyView';
    const subentries = [
      ...(entryEl?.querySelectorAll(
        `.subentries li[data-${dataKey === 'wideView' ? 'wide' : 'story'}-view]`,
      ) ?? []),
    ];
    // l'emphase se pose sur TOUTES les sous-entrées de l'entrée : l'histoire
    // qui joue doit effacer celle de l'autre histoire, pas seulement les siennes
    const allSubentries = [...(entryEl?.querySelectorAll('.subentries li') ?? [])];
    const voice = document.createElement('div');
    voice.className = 'story-voice';
    voice.setAttribute('aria-hidden', 'true'); // le texte canonique vit dans la copie feuille
    const side = post.querySelector('.story-side');
    const stageEl = post.querySelector('.story-stage');
    let lastMapped = null;

    const subentryFor = (index) => {
      const key = String(index);
      return (
        subentries.find((li) => (li.dataset[dataKey] ?? '').split(/\s+/).includes(key)) ?? null
      );
    };

    const syncVoice = (index) => {
      const li = subentryFor(index) ?? lastMapped;
      if (li === lastMapped && voice.childElementCount > 0) return; // déjà en place
      lastMapped = li;
      const heading = li?.querySelector('h3');
      const paragraph = li?.querySelector('p');
      voice.replaceChildren(
        ...(heading ? [heading.cloneNode(true)] : []),
        ...(paragraph ? [paragraph.cloneNode(true)] : []),
      );
      allSubentries.forEach((item) => {
        item.classList.toggle('is-current', item === li);
        item.classList.toggle('is-sync-dim', item !== li);
      });
    };

    let current = -1;

    // Les deux lumières : la vue où la scène bascule Parchemin→Bougie.
    // --candle suit le rail (0 avant la vue, 1 après, la fraction
    // traverse) — la scène s'assombrit AU FIL du défilement ; en repli
    // calme, elle marche par pas et les couleurs fondent (CSS).
    const flipAt = post.dataset.flipOnView ? Number.parseInt(post.dataset.flipOnView, 10) : null;

    const applyCandle = (exactProgress) => {
      if (flipAt === null || Number.isNaN(flipAt)) return;
      const c = Math.min(1, Math.max(0, exactProgress - flipAt));
      post.style.setProperty('--candle', c.toFixed(3));
    };

    // la narration vit au sommet de la colonne latérale, avant la légende
    if (side && subentries.length > 0) {
      side.prepend(voice);
    }

    // Histoire LARGE : la hauteur du bloc texte (voix + légende) est
    // RÉSERVÉE sur la pire des sous-entrées — le paragraphe change de
    // longueur d'une vue à l'autre, la pile centrée ne doit jamais se
    // recentrer (l'écran ne bouge pas, non plus ici). Le plafond de
    // hauteur des images est CALIBRÉ sur le chrome mesuré de la scène :
    // paddings, écarts, rail, dock, matelas/barre du cadre — la colonne
    // ne déborde jamais le stage, le centrage ne bougle pas.
    if (post.classList.contains('story--wide') && side && subentries.length > 0) {
      const reserveAndCalibrate = () => {
        let worst = 0;
        const keep = voice.cloneNode(true);
        for (const li of subentries) {
          const heading = li.querySelector('h3');
          const paragraph = li.querySelector('p');
          voice.replaceChildren(
            ...(heading ? [heading.cloneNode(true)] : []),
            ...(paragraph ? [paragraph.cloneNode(true)] : []),
          );
          worst = Math.max(worst, side.offsetHeight);
        }
        voice.replaceChildren(...keep.children);
        post.style.setProperty('--text-h', `${Math.ceil(worst)}px`);

        const img = post.querySelector('.phonepost-view img');
        const frameEl = img?.closest('.shot-frame, .deskframe');
        const slotEl = post.querySelector('.story-slot');
        if (stageEl && img && frameEl && slotEl) {
          const chromeH = frameEl.offsetHeight - img.getBoundingClientRect().height;
          const slotExtras = slotEl.offsetHeight - frameEl.offsetHeight; // rail + dock + écarts
          const cs = getComputedStyle(stageEl);
          const padV =
            (parseFloat(cs.paddingTop) || 0) +
            (parseFloat(cs.paddingBottom) || 0) +
            (parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0);
          // 8px de mou : une colonne PILE à la hauteur du stage laisse le
          // centrage aux arrondis sub-pixel — un souffle d'air le fige
          const cap = stageEl.clientHeight - padV - slotExtras - chromeH - Math.ceil(worst) - 8;
          post.style.setProperty('--img-cap', `${Math.max(160, Math.floor(cap))}px`);
        }
      };
      reserveAndCalibrate();
      document.fonts?.ready.then(reserveAndCalibrate);
      voiceMeasures.push(reserveAndCalibrate);
      // la scène change de hauteur au resize : le plafond suit (gardé par
      // filet rAF, comme tout travail lié au scroll)
      window.addEventListener('resize', frameGuarded(reserveAndCalibrate), { passive: true });
    }

    const setView = (index) => {
      if (index === current) return;
      current = index;
      views.forEach((view, i) => {
        view.classList.toggle('is-active', i === index);
      });
      pills.forEach((p, i) => {
        const active = i === index;
        p.classList.toggle('is-active', active);
        p.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (caption) {
        const pill = pills[index];
        if (pill && (pill.dataset.caption || pill.dataset.enCaption)) {
          caption.textContent = captionFor(pill);
        }
      }
      syncVoice(index);
      // la bougie se pose d'un coup au changement de vue (applyCandle
      // attend une progression EXACTE : la vue atteinte = flipAt + 1) —
      // en histoire épinglée, setFill réécrit aussitôt la valeur scrubbée
      applyCandle(index >= flipAt ? flipAt + 1 : flipAt);
      // L'encre tourne la page : la classe repart à chaque changement de
      // vue pour rejouer balayage + front or + légende ré-encrée. Le
      // reflow explicite réarme l'animation d'un pseudo-élément qui, sans
      // lui, resterait à son état final (styles.css, « L'encre tourne la
      // page »). Coupée d'office en mouvement réduit — rien à rejouer.
      if (!reduceMotion) {
        post.classList.remove('is-inking');
        void post.offsetWidth;
        post.classList.add('is-inking');
      }
    };

    const setFill = (index, fraction) => {
      segs.forEach((fill, i) => {
        fill.style.width = i < index ? '100%' : i > index ? '0%' : `${Math.round(fraction * 100)}%`;
      });
      applyCandle(index + fraction);
    };

    const isStory =
      post.classList.contains('story') && !reduceMotion && 'IntersectionObserver' in window;

    if (!isStory) {
      // Repli calme : pas d'épinglage, le dock bascule les vues. La légende
      // reste annoncée (polite) — c'est un clic qui la change.
      post.classList.add('is-calm');
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          setView(Number.parseInt(pill.dataset.view ?? '0', 10));
        });
      });
      setView(0);
      return;
    }

    // En histoire épinglée, la légende suit le doigt : l'annoncer à chaque
    // vue deviendrait un flot (≈19 annonces sur la page) — elle reste
    // visible, silencieuse pour le lecteur d'écran.
    if (caption) {
      caption.setAttribute('aria-live', 'off');
    }

    // Histoire épinglée : la progression vit dans le défilement
    let top = 0;
    let span = 1;

    const measure = () => {
      const rect = post.getBoundingClientRect();
      top = rect.top + window.scrollY;
      span = Math.max(1, post.offsetHeight - window.innerHeight);
      update();
    };

    const update = () => {
      // une histoire ne joue que si sa scène est À L'ÉCRAN : sans cette
      // garde, le saut qui ENTRÉ dans l'histoire large réveille l'histoire
      // téléphone déjà passée (son dernier setView) et lui vole l'emphase
      // de la copie feuille — voix et folie désynchronisées
      const stageRect = stageEl?.getBoundingClientRect();
      if (stageRect && (stageRect.bottom < 0 || stageRect.top > window.innerHeight)) return;
      const progress = Math.min(1, Math.max(0, (window.scrollY - top) / span));
      const exact = progress * count;
      const index = Math.min(count - 1, Math.floor(exact));
      setView(index);
      setFill(index, exact - index);
    };

    pills.forEach((pill, i) => {
      pill.addEventListener('click', () => {
        // la pilule MÈNE le défilement : atterrir au début de sa vue
        const target = top + (i / count) * span + 1;
        window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });

    window.addEventListener('scroll', frameGuarded(update), { passive: true });
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    measure();
    setView(0);
  });

  /* ---------- La plume inscrit la page -----
     Chaque bloc reçoit .reveal + --reveal-delay ; l'observateur déclenche
     .is-risen quand l'entrée entre à l'écran. Une seule liste réglée en
     stagger par entrée (le geste du registre de l'app), délais plafonnés. */

  const STEP = 70; // ms entre deux entrées réglées
  const armed = [];
  const heroArmed = [];

  const armReveal = (el, delay) => {
    if (!el) return;
    el.classList.add('reveal');
    el.style.setProperty('--reveal-delay', `${Math.round(delay)}ms`);
    armed.push(el);
  };

  // Les pas d'une entrée du registre : la tête trace son filet, les entrées
  // réglées se posent l'une après l'autre, les preuves tamponnent, la
  // colonne visuelle arrive en fin
  const armEntry = (entry) => {
    const head = entry.querySelector('.entry-head');
    const copy = entry.querySelector('.entry-copy');
    // les entrées à histoire épinglée n'ont plus de corps en colonnes : les
    // postes (téléphone, puis histoire large) sont les enfants visuels
    // directs de l'entrée, armés en séquence ; l'entrée I garde sa colonne
    // média (démo + captures)
    const bodyMedia = entry.querySelector('.entry-body > :not(.entry-copy)');
    const medias = [...(bodyMedia ? [bodyMedia] : []), ...entry.querySelectorAll('.phonepost')];
    const deployPanel = entry.querySelector('.deploy');

    if (head && !deployPanel) {
      armReveal(head, 0);
    }

    let delay = 90;
    if (deployPanel) {
      // Repos long : la tête compacte vit dans le panneau avec le reste de
      // la copie, le terminal clôt la séquence
      const parts = deployPanel.querySelector('.entry-copy').children;
      for (const part of parts) {
        armReveal(part, delay);
        delay += STEP;
      }
      armReveal(deployPanel.querySelector('.terminal'), delay + 40);
    } else {
      const subs = copy?.querySelector('.subentries');
      if (subs) {
        const items = [...subs.querySelectorAll('li')].slice(0, 6);
        for (const li of items) {
          armReveal(li, delay);
          delay += STEP;
        }
        armReveal(copy.querySelector('.proof'), delay);
      } else if (copy) {
        for (const child of copy.children) {
          armReveal(child, delay);
          delay += STEP;
        }
      }
      medias.forEach((m, k) => {
        armReveal(m, Math.max(delay, 180) + k * STEP);
      });
      // Les vues élargies restantes (l'entrée I garde sa fenêtre bureau)
      // se posent en fin d'entrée
      entry.querySelectorAll('.entry-wide').forEach((wide, i) => {
        armReveal(wide, Math.max(delay, 180) + STEP * (medias.length + i + 1));
      });
    }
  };

  // La séance s'ouvre d'elle-même : pastille de rencontre, nom, slogan,
  // offre, verbes, puis LES MESURES DU SRD (la bande de chiffres du hero)
  // et le signal de descente. La paire de téléphones vit sa propre entrée
  // (pair-in, styles.css).
  const armHero = () => {
    const pieces = ['.round-chip', '.hero-name', '.hero-tagline', '.hero-offer', '.cta-row'];
    let delay = 0;
    for (const selector of pieces) {
      const el = document.querySelector(selector);
      if (el) heroArmed.push(el);
      armReveal(el, delay);
      delay += STEP;
    }
    document.querySelectorAll('.hero .stat').forEach((stat, i) => {
      heroArmed.push(stat);
      armReveal(stat, delay + 60 + i * 90);
    });
    const cue = document.querySelector('.scrollcue');
    if (cue) heroArmed.push(cue);
    armReveal(cue, delay + 60 + 4 * 90);
  };

  // Les quadrants de personnalité (entrée à part entière, révélés par
  // l'observateur des entrées) puis le pied de page (observé à part)
  const armPersonality = () => {
    document.querySelectorAll('.personality article').forEach((article, i) => {
      armReveal(article, i * 90);
    });
  };

  const armFooter = () => {
    armReveal(document.querySelector('.footer-close'), 0);
    const footerCols = document.querySelectorAll('.site-footer .footer-cols > div');
    footerCols.forEach((col, i) => {
      armReveal(col, 90 + i * 80);
    });
    armReveal(document.querySelector('.footer-seal-row'), 90 + footerCols.length * 80);
  };

  const riseAll = () => {
    for (const el of armed) {
      el.classList.add('is-risen');
    }
  };

  const riseHero = () => {
    for (const el of heroArmed) {
      el.classList.add('is-risen');
    }
  };

  if (reduceMotion || !('IntersectionObserver' in window)) {
    armHero();
    document.querySelectorAll('.entry').forEach(armEntry);
    armPersonality();
    armFooter();
    riseAll();
  } else {
    armHero();
    armPersonality();
    document.querySelectorAll('.entry').forEach(armEntry); // armées d'emblée, révélées au scroll
    riseHero(); // la séance s'inscrit dès l'arrivée

    const entryIo = new IntersectionObserver(
      (entries) => {
        for (const observed of entries) {
          if (observed.isIntersecting) {
            for (const el of armed) {
              if (observed.target.contains(el) || el.contains(observed.target)) {
                el.classList.add('is-risen');
              }
            }
            entryIo.unobserve(observed.target);
          }
        }
      },
      // PAS de seuil en RATIO : une entrée à deux histoires mesure ~7000px
      // — 12 % d'elle ≈ un viewport entier, et une arrivée par ancre
      // frôlait la falaise sans jamais la franchir (section II muette,
      // .reveal à opacité 0, aucune erreur). On déclenche sur la GÉOMÉTRIE
      // : le haut de l'entrée atteint la moitié haute de l'écran.
      { threshold: 0, rootMargin: '0px 0px -60% 0px' },
    );
    document.querySelectorAll('.entry').forEach((section) => {
      entryIo.observe(section);
    });

    // Le pied se lève à son tour quand on y arrive
    const footer = document.querySelector('.site-footer');
    if (footer) {
      const footerIo = new IntersectionObserver(
        (entries) => {
          for (const observed of entries) {
            if (observed.isIntersecting) {
              armFooter();
              riseAll();
              footerIo.disconnect();
            }
          }
        },
        { threshold: 0.2 },
      );
      footerIo.observe(footer);
    }
  }

  /* ---------- Les mesures comptent ----------
     Chaque chiffre monte de 0 à sa valeur quand la bande entre à l'écran —
     une fois, en accéléré doux. Sans JS ou en mouvement réduit, la valeur
     finale est déjà dans le HTML : rien ne manque. */

  const countUp = (el) => {
    const target = Number.parseInt(el.dataset.count ?? el.textContent, 10);
    if (!Number.isFinite(target) || target <= 0) return;
    if (reduceMotion) {
      el.textContent = String(target);
      return;
    }
    const duration = 950;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  };

  const statband = document.querySelector('.statband');
  if (statband && 'IntersectionObserver' in window && !reduceMotion) {
    let counted = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !counted) {
            counted = true;
            statband.querySelectorAll('.stat-value').forEach((el, i) => {
              window.setTimeout(() => countUp(el), 90 + i * 90);
            });
            io.disconnect();
          }
        }
      },
      { threshold: 0.35 },
    );
    io.observe(statband);
  }

  /* ---------- La marge du registre (fil de lecture ≥1360px) ---------- */

  // Une règle d'encre descend la marge au fil du scroll, la plume en
  // pointe ; chaque entrée du registre y porte son ordinal, cliquable.
  // Bâtie ici (rien sans JS), masquée sous 1360px par styles.css. Elle ne
  // s'anime jamais d'elle-même : chaque état ne fait que suivre le doigt.
  const buildMarginToc = () => {
    const main = document.querySelector('main');
    const entries = [...document.querySelectorAll('main .entry[id]')];
    if (!main || entries.length === 0) return;

    // la série de dés du registre : chaque entrée porte son type, la plume
    // voyageuse prend la forme du DERNIER DÉ franchi
    const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

    const nav = document.createElement('nav');
    nav.className = 'margin-toc';
    nav.setAttribute('aria-label', STRINGS[lang].tocLabel);

    const line = document.createElement('div');
    line.className = 'toc-line';
    const fill = document.createElement('div');
    fill.className = 'toc-fill';
    line.append(fill);

    const nib = document.createElement('div');
    nib.className = 'toc-nib';
    nav.append(line, nib);

    const items = entries.map((entry, i) => {
      const head = entry.querySelector('.entry-head') ?? entry;
      const label = head.querySelector('.entry-ordinal')?.textContent ?? '';
      // la série polyédrique monte le long du registre (d4→d20), puis
      // recommence comme une seconde série de dés — un TYPE PAR ENTRÉE
      const die = DIE_TYPES[i % DIE_TYPES.length];
      const link = document.createElement('a');
      link.className = 'toc-entry' + (entry.classList.contains('is-lead') ? ' is-lead' : '');
      link.href = `#${entry.id}`;
      const frTitle = head.querySelector('.entry-title [lang="fr"]')?.textContent ?? '';
      const enTitle = head.querySelector('.entry-title [lang="en"]')?.textContent ?? '';
      if (frTitle) {
        // data-toc-title porte la langue ACTIVE (la chip du survol le lit,
        // attr(data-toc-title) dans styles.css) ; les originaux fr/en
        // restent à part pour la bascule
        link.dataset.tocTitleFr = frTitle;
        if (enTitle) {
          link.dataset.tocTitleEn = enTitle;
        }
        link.dataset.tocTitle = frTitle;
        link.setAttribute('aria-label', `${label} — ${frTitle}`);
      }
      const text = document.createElement('span');
      text.className = 'toc-label';
      text.textContent = label;
      const tick = document.createElement('i');
      tick.className = `toc-tick is-${die}`;
      link.append(text, tick);
      nav.append(link);
      return { head, link, die, y: 0 };
    });

    main.append(nav);
    marginTocNav = nav;

    let spanTop = 0;
    let spanHeight = 1;
    let currentIdx = -2;
    let mainTop = 0;

    const update = () => {
      // la ligne de lecture vit au milieu du viewport — ramenée dans le
      // repère de main (les tops du fil et des ordinaux y sont absolus,
      // et le hero précède main : sans ce retrait, le fil court une
      // entrée devant la lecture)
      const reading = window.scrollY + window.innerHeight * 0.5 - mainTop;
      const progress = Math.min(1, Math.max(0, (reading - spanTop) / spanHeight));
      fill.style.transform = `scaleY(${progress})`;
      nib.style.top = `${spanTop + progress * spanHeight}px`;

      let idx = -1;
      for (let i = 0; i < items.length; i++) {
        // grâce de 2 px : une tête posée PILE sur la ligne de lecture compte
        // comme courante (scrollY est entier, les tops ne le sont pas)
        if (reading + 2 >= items[i].y) idx = i;
      }
      if (idx !== currentIdx) {
        currentIdx = idx;
        items.forEach((item, i) => {
          const passed = i <= idx;
          const current = i === idx;
          item.link.classList.toggle('is-passed', passed);
          item.link.classList.toggle('is-current', current);
        });
        // la plume devient le dernier dé franchi : nue au-dessus de
        // l'entrée I, d4 après elle, d6 après II… le registre se joue
        nib.className = 'toc-nib' + (idx >= 0 ? ` is-die is-${items[idx].die}` : '');
      }
    };

    const measure = () => {
      mainTop = main.getBoundingClientRect().top + window.scrollY;
      for (const item of items) {
        item.y = item.head.getBoundingClientRect().top + window.scrollY - mainTop;
        // sans ce top, les ancres absolues s'empilent toutes à l'origine de
        // la nav (le sommet de main) — neuf ordinaux superposés, illisibles
        item.link.style.top = `${Math.round(item.y)}px`;
      }
      spanTop = items[0].y;
      spanHeight = Math.max(1, items[items.length - 1].y - spanTop);
      line.style.top = `${spanTop}px`;
      line.style.height = `${spanHeight}px`;
      update();
    };

    window.addEventListener('scroll', frameGuarded(update), { passive: true });
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    measure();
  };

  buildMarginToc();

  /* ---------- La bande du tour (mobile & tablette, <1360px) ----------
     Le tour de table littéral : la pastille du tour courant posée en bas,
     avec le verbe « tour suivant ». Bâtie ici (rien sans JS), cachée au
     très grand écran où la marge du registre prend le relais. */

  const buildTurnband = () => {
    const main = document.querySelector('main');
    const hero = document.querySelector('.hero');
    const footer = document.querySelector('.site-footer');
    const entries = [...document.querySelectorAll('main .entry[id]')];
    if (!main || entries.length === 0) return;

    const band = document.createElement('nav');
    band.className = 'turnband is-hidden';
    band.setAttribute('aria-label', STRINGS[lang].turnLabel);

    const ordinal = document.createElement('span');
    ordinal.className = 'turnband-ordinal';
    const title = document.createElement('span');
    title.className = 'turnband-title';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'turnband-next';

    band.append(ordinal, title, next);
    document.body.append(band);
    turnband = band;

    const heads = entries.map((entry) => ({
      entry,
      head: entry.querySelector('.entry-head') ?? entry,
      fr: entry.querySelector('.entry-title [lang="fr"]')?.textContent ?? '',
      en: entry.querySelector('.entry-title [lang="en"]')?.textContent ?? '',
      label: entry.querySelector('.entry-ordinal')?.textContent ?? '',
      lead: entry.classList.contains('is-lead'),
      y: 0,
    }));

    let heroGone = false;
    let footerNear = false;
    let currentIdx = -1;

    const updateVisibility = () => {
      band.classList.toggle('is-hidden', !heroGone || footerNear);
    };

    if ('IntersectionObserver' in window) {
      const heroIo = new IntersectionObserver(
        (observed) => {
          heroGone = !observed[0].isIntersecting;
          updateVisibility();
        },
        { threshold: 0.12 },
      );
      if (hero) heroIo.observe(hero);
      const footerIo = new IntersectionObserver(
        (observed) => {
          footerNear = observed[0].isIntersecting;
          updateVisibility();
        },
        { rootMargin: '0px 0px 25% 0px' },
      );
      if (footer) footerIo.observe(footer);
    } else {
      heroGone = true;
      updateVisibility();
    }

    const update = () => {
      const reading = window.scrollY + window.innerHeight * 0.5;
      let idx = -1;
      for (let i = 0; i < heads.length; i++) {
        if (reading + 2 >= heads[i].y) idx = i;
      }
      if (idx !== currentIdx) {
        currentIdx = idx;
        if (idx >= 0) {
          const item = heads[idx];
          ordinal.textContent = item.label;
          title.textContent = lang === 'en' ? item.en || item.fr : item.fr;
          band.classList.toggle('is-lead', item.lead);
          band.setAttribute(
            'aria-label',
            STRINGS[lang].turnAria(lang === 'en' ? item.en || item.fr : item.fr),
          );
        }
      }
    };

    const measure = () => {
      for (const item of heads) {
        item.y = item.head.getBoundingClientRect().top + window.scrollY;
      }
      update();
    };

    next.addEventListener('click', () => {
      // le dernier tour boucle vers le premier — la séance est un cercle
      const nextIdx = (currentIdx + 1 + heads.length) % heads.length;
      const target = heads[nextIdx].entry;
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });

    window.addEventListener('scroll', frameGuarded(update), { passive: true });
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    measure();
    refreshTurnband = () => {
      currentIdx = -2; // force le re-render : le titre doit changer de langue
      update();
    };
  };

  // La bande du tour se re-traduit à la bascule FR|EN : le titre courant
  // change de langue sans attendre le prochain passage de ligne de lecture
  let refreshTurnband = null;

  const localizeTurnband = () => {
    if (!turnband) return;
    turnband.setAttribute('aria-label', STRINGS[lang].turnLabel);
    turnband.querySelector('.turnband-next').textContent = STRINGS[lang].turnNext;
    refreshTurnband?.();
  };

  buildTurnband();

  /* ---------- Copier les commandes ---------- */

  const copyBtn = document.querySelector('[data-copy]');
  const code = document.querySelector('.terminal code');
  let copyFlashUntil = 0;

  // État de retour honnête, comme le tampon copier de l'app
  const flashCopied = (ok) => {
    copyBtn.textContent = ok ? STRINGS[lang].copyOk : STRINGS[lang].copyFail;
    copyFlashUntil = Date.now() + 2000;
    window.setTimeout(() => {
      copyBtn.textContent = STRINGS[lang].copyIdle;
      copyFlashUntil = 0;
    }, 2000);
  };

  copyBtn?.addEventListener('click', () => {
    const text = code?.textContent?.replace(/\$ /g, '') ?? '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => flashCopied(true),
        () => flashCopied(false),
      );
    } else {
      flashCopied(false);
    }
  });

  /* ---------- Visionneuse plein écran -----
     Le vocabulaire de l'app : fondu du rideau, l'image se pose depuis 0.96,
     le zoom lui-même ne s'anime jamais (outil de lecture). */

  const viewer = document.querySelector('.viewer');
  const viewerFrame = viewer?.querySelector('.viewer-frame');
  const viewerCaption = viewer?.querySelector('.viewer-caption');
  const viewerClose = viewer?.querySelector('.viewer-close');
  let viewerImg = null;
  let lastFocus = null;

  const closeViewer = () => {
    if (!viewer || viewer.hidden) return;
    viewer.hidden = true;
    document.body.style.overflow = '';
    lastFocus?.focus();
  };

  const openViewer = (img) => {
    if (!viewer || !viewerFrame) return;
    // l'image naît à la première ouverture — jamais de <img> vide dans la page
    if (!viewerImg) {
      viewerImg = document.createElement('img');
      viewerImg.className = 'viewer-img';
      viewerImg.decoding = 'async';
      viewerFrame.appendChild(viewerImg);
    }
    lastFocus = document.activeElement;
    viewerImg.src = img.src;
    viewerImg.alt = img.alt;
    if (viewerCaption) {
      viewerCaption.textContent = img.alt;
    }
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
    viewerClose?.focus();
  };

  if (viewer && viewerFrame) {
    // Chaque écran de téléphone s'ouvre en plein écran ; dans un poste de
    // consultation, c'est la vue ACTIVE qui s'ouvre (les autres n'écoutent pas)
    document
      .querySelectorAll('.shot-frame img, .portrait-frame img, .deskframe img')
      .forEach((img) => {
        img.addEventListener('click', () => {
          if (img.classList.contains('phonepost-view') && !img.classList.contains('is-active')) {
            return;
          }
          openViewer(img);
        });
      });

    viewer.addEventListener('click', (event) => {
      if (event.target === viewer || event.target === viewerClose) closeViewer();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeViewer();
      if (event.key === 'Tab' && !viewer.hidden) {
        // la visionneuse ne possède qu'un seul focusable : le piège tient en une ligne
        event.preventDefault();
        viewerClose?.focus();
      }
    });
  }

  /* ---------- Bascule FR|EN + synchronisation initiale ---------- */

  document.querySelectorAll('.lang-toggle [data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.lang === 'en' ? 'en' : 'fr';
      if (next !== lang) {
        applyLang(next, { persist: true });
      }
    });
  });

  // État initial idempotent : aligne bascule, attributs, légendes, <title>,
  // démo et bande du tour sur la langue posée avant rendu par le script de <head>.
  const nextBtn = turnband?.querySelector('.turnband-next');
  if (nextBtn) {
    nextBtn.textContent = STRINGS[lang].turnNext;
  }
  applyLang(lang);
})();
