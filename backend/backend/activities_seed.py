from models import Activity, ActivityFamily

ACTIVITIES_SEED = [
    # HABITAT - Artisans
    {"label": "Plombier", "family": ActivityFamily.HABITAT, "synonyms": ["plomberie", "plombier chauffagiste", "dépannage plomberie"]},
    {"label": "Électricien", "family": ActivityFamily.HABITAT, "synonyms": ["électricité", "électricien dépannage", "installation électrique"]},
    {"label": "Maçon", "family": ActivityFamily.HABITAT, "synonyms": ["maçonnerie", "maçon bâtiment", "travaux maçonnerie"]},
    {"label": "Menuisier", "family": ActivityFamily.HABITAT, "synonyms": ["menuiserie", "menuisier bois", "menuisier ébéniste"]},
    {"label": "Peintre", "family": ActivityFamily.HABITAT, "synonyms": ["peinture", "peintre décorateur", "peintre bâtiment"]},
    {"label": "Couvreur", "family": ActivityFamily.HABITAT, "synonyms": ["couverture", "couvreur zingueur", "toiture"]},
    {"label": "Chauffagiste", "family": ActivityFamily.HABITAT, "synonyms": ["chauffage", "chauffagiste climatisation", "installation chauffage"]},
    {"label": "Carreleur", "family": ActivityFamily.HABITAT, "synonyms": ["carrelage", "pose carrelage", "carreleur faïencier"]},
    {"label": "Serrurier", "family": ActivityFamily.HABITAT, "synonyms": ["serrurerie", "serrurier dépannage", "dépannage serrure"]},
    {"label": "Vitrier", "family": ActivityFamily.HABITAT, "synonyms": ["vitrerie", "miroiterie", "vitrier miroitier"]},
    {"label": "Charpentier", "family": ActivityFamily.HABITAT, "synonyms": ["charpente", "charpentier couvreur"]},
    {"label": "Isolation", "family": ActivityFamily.HABITAT, "synonyms": ["isolation thermique", "isolation phonique", "isolateur"]},
    {"label": "Terrassement", "family": ActivityFamily.HABITAT, "synonyms": ["terrassier", "travaux terrassement"]},
    {"label": "Paysagiste", "family": ActivityFamily.HABITAT, "synonyms": ["jardinier", "aménagement extérieur", "entretien jardin"]},
    {"label": "Plâtrier", "family": ActivityFamily.HABITAT, "synonyms": ["plâtrerie", "plaquiste", "plâtrier plaquiste"]},
    
    # COMMERCE
    {"label": "Boulangerie", "family": ActivityFamily.COMMERCE, "synonyms": ["boulanger", "pain", "pâtisserie boulangerie"]},
    {"label": "Boucherie", "family": ActivityFamily.COMMERCE, "synonyms": ["boucher", "boucherie charcuterie", "viande"]},
    {"label": "Pharmacie", "family": ActivityFamily.COMMERCE, "synonyms": ["pharmacien", "officine"]},
    {"label": "Fleuriste", "family": ActivityFamily.COMMERCE, "synonyms": ["fleurs", "composition florale"]},
    {"label": "Épicerie", "family": ActivityFamily.COMMERCE, "synonyms": ["alimentation", "épicerie fine", "supérette"]},
    {"label": "Tabac Presse", "family": ActivityFamily.COMMERCE, "synonyms": ["bureau tabac", "presse", "tabac"]},
    {"label": "Primeur", "family": ActivityFamily.COMMERCE, "synonyms": ["fruits légumes", "maraîcher"]},
    {"label": "Poissonnier", "family": ActivityFamily.COMMERCE, "synonyms": ["poissonnerie", "fruits de mer"]},
    {"label": "Opticien", "family": ActivityFamily.COMMERCE, "synonyms": ["lunettes", "optique"]},
    {"label": "Bijouterie", "family": ActivityFamily.COMMERCE, "synonyms": ["bijoutier", "horlogerie"]},
    
    # RESTAURATION
    {"label": "Restaurant", "family": ActivityFamily.RESTAURATION, "synonyms": ["resto", "gastronomie"]},
    {"label": "Pizzeria", "family": ActivityFamily.RESTAURATION, "synonyms": ["pizza", "pizzaiolo"]},
    {"label": "Brasserie", "family": ActivityFamily.RESTAURATION, "synonyms": ["bar brasserie"]},
    {"label": "Traiteur", "family": ActivityFamily.RESTAURATION, "synonyms": ["traiteur événementiel"]},
    {"label": "Café", "family": ActivityFamily.RESTAURATION, "synonyms": ["bar", "café bar"]},
    {"label": "Kebab", "family": ActivityFamily.RESTAURATION, "synonyms": ["sandwich grec", "fast food"]},
    {"label": "Sushi", "family": ActivityFamily.RESTAURATION, "synonyms": ["restaurant japonais", "sushi bar"]},
    {"label": "Crêperie", "family": ActivityFamily.RESTAURATION, "synonyms": ["crêpes", "galettes"]},
    
    # BEAUTÉ
    {"label": "Coiffeur", "family": ActivityFamily.BEAUTE, "synonyms": ["coiffure", "salon coiffure", "coiffeur barbier"]},
    {"label": "Esthéticienne", "family": ActivityFamily.BEAUTE, "synonyms": ["institut beauté", "esthétique"]},
    {"label": "Barbier", "family": ActivityFamily.BEAUTE, "synonyms": ["barber shop", "salon barbier"]},
    {"label": "Manucure", "family": ActivityFamily.BEAUTE, "synonyms": ["nail bar", "onglerie"]},
    {"label": "Spa", "family": ActivityFamily.BEAUTE, "synonyms": ["centre bien-être", "hammam"]},
    {"label": "Tatoueur", "family": ActivityFamily.BEAUTE, "synonyms": ["tatouage", "tattoo"]},
    
    # AUTO
    {"label": "Garage auto", "family": ActivityFamily.AUTO, "synonyms": ["garage", "réparation auto", "mécanique auto"]},
    {"label": "Carrosserie", "family": ActivityFamily.AUTO, "synonyms": ["carrossier", "peinture auto"]},
    {"label": "Contrôle technique", "family": ActivityFamily.AUTO, "synonyms": ["CT", "centre contrôle technique"]},
    {"label": "Lavage auto", "family": ActivityFamily.AUTO, "synonyms": ["station lavage", "car wash"]},
    {"label": "Pneumatique", "family": ActivityFamily.AUTO, "synonyms": ["pneu", "centre pneu"]},
    {"label": "Auto-école", "family": ActivityFamily.AUTO, "synonyms": ["permis conduire", "école conduite"]},
    
    # SANTÉ
    {"label": "Médecin généraliste", "family": ActivityFamily.SANTE, "synonyms": ["docteur", "médecin"]},
    {"label": "Dentiste", "family": ActivityFamily.SANTE, "synonyms": ["chirurgien dentiste", "cabinet dentaire"]},
    {"label": "Kinésithérapeute", "family": ActivityFamily.SANTE, "synonyms": ["kiné", "physiothérapeute"]},
    {"label": "Ostéopathe", "family": ActivityFamily.SANTE, "synonyms": ["ostéopathie"]},
    {"label": "Infirmier", "family": ActivityFamily.SANTE, "synonyms": ["infirmière", "soins infirmiers"]},
    {"label": "Vétérinaire", "family": ActivityFamily.SANTE, "synonyms": ["véto", "clinique vétérinaire"]},
    {"label": "Ophtalmologue", "family": ActivityFamily.SANTE, "synonyms": ["ophtalmo", "ophtalmologie"]},
    {"label": "Podologue", "family": ActivityFamily.SANTE, "synonyms": ["pédicure podologue"]},
    
    # B2B
    {"label": "Expert-comptable", "family": ActivityFamily.B2B, "synonyms": ["comptable", "cabinet comptable"]},
    {"label": "Avocat", "family": ActivityFamily.B2B, "synonyms": ["cabinet avocat", "juriste"]},
    {"label": "Notaire", "family": ActivityFamily.B2B, "synonyms": ["office notarial", "étude notariale"]},
    {"label": "Architecte", "family": ActivityFamily.B2B, "synonyms": ["architecture", "cabinet architecture"]},
    {"label": "Agence immobilière", "family": ActivityFamily.B2B, "synonyms": ["immobilier", "agence immo"]},
    {"label": "Agence communication", "family": ActivityFamily.B2B, "synonyms": ["agence pub", "marketing"]},
    {"label": "Imprimerie", "family": ActivityFamily.B2B, "synonyms": ["imprimeur", "impression"]},
    {"label": "Consultant", "family": ActivityFamily.B2B, "synonyms": ["conseil", "consulting"]},
    {"label": "Société nettoyage", "family": ActivityFamily.B2B, "synonyms": ["nettoyage professionnel", "entretien locaux"]},
    {"label": "Déménagement", "family": ActivityFamily.B2B, "synonyms": ["déménageur", "transport déménagement"]},
    
    # AUTRE
    {"label": "Pressing", "family": ActivityFamily.AUTRE, "synonyms": ["nettoyage à sec", "laverie"]},
    {"label": "Cordonnier", "family": ActivityFamily.AUTRE, "synonyms": ["cordonnerie", "réparation chaussures"]},
    {"label": "Photographe", "family": ActivityFamily.AUTRE, "synonyms": ["photo", "studio photo"]},
    {"label": "Agence voyage", "family": ActivityFamily.AUTRE, "synonyms": ["voyages", "tourisme"]},
    {"label": "Salle sport", "family": ActivityFamily.AUTRE, "synonyms": ["fitness", "gym", "salle musculation"]},
    {"label": "Banque", "family": ActivityFamily.AUTRE, "synonyms": ["agence bancaire"]},
    {"label": "Assurance", "family": ActivityFamily.AUTRE, "synonyms": ["assureur", "courtier assurance"]},
    
    # HABITAT - Compléments
    {"label": "Étanchéité", "family": ActivityFamily.HABITAT, "synonyms": ["étancheur", "imperméabilisation", "toiture terrasse"]},
    {"label": "Dépannage plomberie", "family": ActivityFamily.HABITAT, "synonyms": ["urgence plomberie", "plombier urgence", "fuite eau"]},
    {"label": "Climatisation", "family": ActivityFamily.HABITAT, "synonyms": ["climaticien", "clim", "installation climatisation"]},
    {"label": "Pompe à chaleur", "family": ActivityFamily.HABITAT, "synonyms": ["PAC", "installation PAC", "chauffage thermodynamique"]},
    {"label": "Ramoneur", "family": ActivityFamily.HABITAT, "synonyms": ["ramonage", "entretien cheminée"]},
    {"label": "Façadier", "family": ActivityFamily.HABITAT, "synonyms": ["ravalement façade", "crépi", "enduit façade"]},
    {"label": "Pisciniste", "family": ActivityFamily.HABITAT, "synonyms": ["piscine", "construction piscine", "entretien piscine"]},
    {"label": "Domotique", "family": ActivityFamily.HABITAT, "synonyms": ["maison connectée", "installation domotique"]},
    {"label": "Volet roulant", "family": ActivityFamily.HABITAT, "synonyms": ["store", "fermeture", "motorisation volet"]},
    {"label": "Portail automatique", "family": ActivityFamily.HABITAT, "synonyms": ["automatisme portail", "motorisation portail"]},
    
    # COMMERCE - Compléments
    {"label": "Fromager", "family": ActivityFamily.COMMERCE, "synonyms": ["fromagerie", "crémerie"]},
    {"label": "Caviste", "family": ActivityFamily.COMMERCE, "synonyms": ["cave à vin", "marchand de vin"]},
    {"label": "Chocolatier", "family": ActivityFamily.COMMERCE, "synonyms": ["chocolaterie", "confiserie"]},
    {"label": "Pâtisserie", "family": ActivityFamily.COMMERCE, "synonyms": ["pâtissier", "gâteaux"]},
    {"label": "Traiteur asiatique", "family": ActivityFamily.COMMERCE, "synonyms": ["traiteur chinois", "épicerie asiatique"]},
    
    # SERVICES
    {"label": "Aide à domicile", "family": ActivityFamily.AUTRE, "synonyms": ["service à la personne", "aide ménagère"]},
    {"label": "Garde enfant", "family": ActivityFamily.AUTRE, "synonyms": ["nounou", "assistante maternelle", "crèche"]},
    {"label": "Cours particuliers", "family": ActivityFamily.AUTRE, "synonyms": ["soutien scolaire", "professeur particulier"]},
    {"label": "Coach sportif", "family": ActivityFamily.AUTRE, "synonyms": ["personal trainer", "préparateur physique"]},
    {"label": "Toiletteur", "family": ActivityFamily.AUTRE, "synonyms": ["toilettage canin", "salon toilettage"]},
    {"label": "Pension animaux", "family": ActivityFamily.AUTRE, "synonyms": ["garde animaux", "pension chien chat"]},
    {"label": "Escape game", "family": ActivityFamily.AUTRE, "synonyms": ["jeu évasion", "escape room"]},
    {"label": "Bowling", "family": ActivityFamily.AUTRE, "synonyms": ["piste bowling"]},
    {"label": "Karting", "family": ActivityFamily.AUTRE, "synonyms": ["circuit karting", "kart"]},
]
