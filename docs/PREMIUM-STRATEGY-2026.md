# Dispo Premium — stratégie produit et économique 2026

> Décision au 27 août 2026. Les prix affichés dans l'app viennent toujours de
> StoreKit / RevenueCat ; les montants ci-dessous définissent la cible Suisse.

## Décision

Dispo doit d'abord densifier son réseau. Le profil, les messages, les SOS, la
participation à un groupe, l'affiliation à une école et son canal de discussion
restent gratuits. La sécurité (adresse privée, blocage, signalement) ne devient
jamais un avantage payant.

Une seule offre est commercialisée au lancement :

- **Dispo gratuit** : réseau et participation sans friction ;
- **Dispo Premium** : **CHF 10/mois sans essai** pour rester flexible, ou
  **CHF 60/an avec 14 jours d'essai gratuit** pour récompenser l'engagement.

La base live est encore trop petite pour conclure statistiquement sur plusieurs
niveaux de prix. Deux durées pour un même droit Premium réduisent le choix,
préservent le même entitlement RevenueCat et donnent un signal exploitable.

## Répartition des capacités

### Gratuit — la boucle réseau

- profil musicien, instruments, niveaux et disponibilités ;
- rattachement à cinq écoles maximum, rôle déclaré et canal communautaire ;
- un premier groupe dirigé, groupes rejoints sans limite artificielle ;
- messages, candidatures SOS, événements et présence ;
- une vidéo de démo ;
- adresse exacte visible uniquement par l'organisateur et les participants
  acceptés ;
- blocage, signalement et contrôles de confidentialité.

### Premium — gagner du temps

- diriger plusieurs groupes ;
- filtres avancés de recherche ;
- événements récurrents, rappels configurables et remplacement automatique ;
- portfolio jusqu'à six vidéos ;
- futurs outils d'organisation avancés, seulement lorsqu'ils sont réellement
  livrés.

Le Premium ne doit pas acheter une meilleure place dans le feed, un badge de
vérification, l'adresse d'un événement, ni une priorité artificielle sur les
SOS. Ces mécaniques détérioreraient la confiance et la liquidité du réseau.

## Paywall

- le montrer au moment où l'utilisateur demande une capacité Premium, jamais
  au premier lancement ;
- expliquer le résultat concret avant la liste des fonctions ;
- afficher les deux durées, le total réellement débité et l'économie annuelle
  calculée depuis les prix StoreKit ;
- expliquer honnêtement l'essai annuel : accès aujourd'hui, durée, puis montant
  et périodicité du premier débit ; ne jamais afficher d'essai sur le mensuel ;
- conserver restauration, gestion d'abonnement et renouvellement automatique
  visibles ;
- bannir compte à rebours, rareté inventée, fausse preuve sociale et économie
  codée en dur.

Objectifs de départ (à mesurer, pas à présenter comme des promesses) : 5 % de
démarrage d'essai, 30 % d'essai vers payant et 2 % de conversion payante à J35.
Le volume actuel ne permet pas encore un A/B test fiable : mesurer d'abord les
moments d'activation et les usages Premium récurrents. L'événement de conversion
principal n'est pas « paywall vu », mais « une organisation répétitive a été
économisée » : deuxième groupe, première série, rappel personnalisé ou auto-SOS.

## Besoins par public

| Public | Besoin gratuit qui crée le réseau | Moment Premium naturel |
|---|---|---|
| Particulier | profil, disponibilités, candidatures, messages, une vidéo | recherche avancée et portfolio de six vidéos |
| Membre d'un groupe | conversation, présence, répertoire, événements | aucun péage pour participer |
| Leader | premier groupe et dates ponctuelles | deuxième groupe, séries, rappels configurables, auto-SOS |
| Professeur | profil, rattachement à l'école, échanges communautaires | mêmes outils personnels tant qu'il n'existe pas de gestion de classe |
| Élève | découverte, communauté, SOS et groupes rejoints | mêmes options individuelles, sans offre étudiante artificielle au lancement |
| École | présence non vérifiée dans l'annuaire et communauté de membres | future console établissement, uniquement après contrat et vérification |

Ce découpage évite le piège classique d'un abonnement « soutien » sans raison
de revenir. Chaque droit payant doit faire gagner du temps plusieurs fois par
mois ; chaque droit gratuit doit augmenter la densité et la confiance du réseau.

## Boucles d'acquisition rentables

1. **École → profils** : un membre ajoute AMR, EPI ou HEM, retrouve sa
   communauté et invite un camarade. L'annuaire précise « non vérifié » tant
   qu'aucun établissement n'a confirmé sa page.
2. **Leader → groupe** : chaque invitation donne une raison fonctionnelle de
   créer un compte (présence, setlist, adresse privée), pas une récompense
   monétaire qui attire de faux comptes.
3. **Professeur → élèves** : partage d'un lien de profil ou de groupe ; aucune
   liste d'élèves centralisée avant d'avoir les consentements et outils de
   modération nécessaires.
4. **SOS → collaboration** : une candidature acceptée peut devenir relation,
   groupe ou recommandation. La visibilité SOS reste identique en gratuit et
   Premium pour préserver la liquidité.

Tant que la rétention à huit semaines et la conversion organique ne sont pas
stables, privilégier partenariats locaux, ambassadeurs d'école, QR codes aux
concerts et invitations produit. Ne pas acheter du trafic qui arrive dans une
ville sans assez de musiciens actifs.

## Écoles et professeurs

Les rôles élève, professeur, ancien élève et équipe sont des attributs de
communauté, pas des abonnements. Un professeur utilise le même Premium tant que
Dispo ne fournit pas de gestion d'élèves complète.

Une future offre **Dispo École** peut viser **CHF 79/mois ou CHF 790/an** jusqu'à
250 membres, avec page officielle vérifiée, administrateurs, classes, présences,
exports et modération. Elle ne doit être vendue qu'après livraison de ces
fonctions et accord direct des établissements. La présence d'AMR, EPI ou HEM
dans l'annuaire n'implique aucun partenariat.

## Économie cible

Sous réserve d'admission au programme Apple Small Business, la commission sur
les achats intégrés est de 15 %. RevenueCat reste gratuit jusqu'à 2 500 USD de
revenu mensuel suivi, puis facture 1 %. Supabase Pro démarre à 25 USD/mois ; les
vidéos doivent rester compressées et chargées à la demande pour conserver une
marge forte.

Avec un revenu brut annuel moyen simplifié de CHF 60 par payant, 10 000 MAU
donnent les ordres de grandeur suivants :

| Conversion payante | Payants | Brut annuel | Après 15 % Apple* |
|---:|---:|---:|---:|
| 1 % | 100 | CHF 6 000 | CHF 5 100 |
| 2 % | 200 | CHF 12 000 | CHF 10 200 |
| 5 % | 500 | CHF 30 000 | CHF 25 500 |

\* Avant TVA, infrastructure, RevenueCat au-delà de son seuil gratuit,
support, modération, acquisition et salaires. Ce sont des scénarios, pas une
prévision.

Le coût d'acquisition payant cible ne devrait pas dépasser CHF 15 par abonné
tant que la rétention réelle n'est pas démontrée. Les garde-fous opérationnels :

- vidéos compressées, quota serveur 1/6 vidéos et quota Storage par compte ;
- alertes sur octets stockés, sorties réseau, MAU et erreurs de webhook ;
- aucun essai accordé deux fois hors règles Apple ;
- entitlement activé uniquement après confirmation serveur RevenueCat ;
- support self-service pour restauration et gestion de l'abonnement ;
- marge analysée par cohorte mensuelle/annuelle, pays et source d'acquisition.

## Mesure et ordre des expériences

Instrumenter sans données sensibles : `premium_trigger_seen`, capacité visée,
offre choisie, achat/restauration, confirmation serveur, renouvellement et
expiration. Ne jamais envoyer l'adresse d'un événement, le texte d'un message
ou l'école masquée dans l'analytics.

Ordre recommandé :

1. vérifier activation, crash-free et confirmation serveur ;
2. mesurer conversion par capacité, pas seulement par écran ;
3. comparer le texte de valeur de l'annuel, sans changer prix et design en même
   temps ;
4. tester CHF 72/an contre CHF 60/an seulement après plusieurs centaines de
   visites qualifiées ;
5. envisager une offre établissement après cinq entretiens école et un pilote
   payé, jamais à partir d'une affiliation déclarative.

## Sources consultées

- [RevenueCat — State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps)
- [RevenueCat — monthly plans for early products](https://www.revenuecat.com/blog/growth/monthly-subscriptions-when-to-offer/)
- [Apple — auto-renewable subscriptions](https://developer.apple.com/app-store/subscriptions/)
- [Apple — Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [Supabase — pricing](https://supabase.com/pricing)
- [RevenueCat — pricing](https://www.revenuecat.com/pricing/)
- [Vampr — App Store](https://apps.apple.com/es/app/music-network-jobs-vampr/id1069819177)
- [BandHelper — pricing](https://www.bandhelper.com/main/pricing_upcoming.html)
- [BandLab — Membership FAQ](https://help.bandlab.com/hc/en-us/articles/20758981227033-BandLab-Membership-FAQ)
