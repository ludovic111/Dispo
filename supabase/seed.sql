-- Seed de développement local : 20 musiciens genevois (mot de passe « jamconnect-demo »),
-- annonces SOS et appréciations. Ne jamais exécuter en production.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '5b07c949-eb23-5cac-b866-1d10dc67abd5', 'authenticated', 'authenticated', 'marco@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Marco Fernández"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '0c99c694-fafc-5ad8-a19c-f9717d5f55d3', 'authenticated', 'authenticated', 'sofia@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Sofia Almeida"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '1912d9b6-90aa-51be-a69c-d5094c9e681f', 'authenticated', 'authenticated', 'julien@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Julien Perrin"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '0b92f4a4-3a8f-5b7e-b41b-577f5d65cc14', 'authenticated', 'authenticated', 'anna@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Anna Kowalska"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '10dd36a7-9a8c-51e3-bc08-631398d13eec', 'authenticated', 'authenticated', 'david@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"David Rochat"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'a368379a-dc49-5194-ac47-3374d0d28557', 'authenticated', 'authenticated', 'elise@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Élise Bonnet"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '23fcbc32-a18d-5fde-b26d-c5507e458323', 'authenticated', 'authenticated', 'karim@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Karim Haddad"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '965f3dcc-0086-576d-9c29-ffc46ab4de19', 'authenticated', 'authenticated', 'lea@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Léa Zbinden"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '6d023718-28d9-5b0f-b505-c090b5c7c311', 'authenticated', 'authenticated', 'pablo@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Pablo Gutiérrez"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'a18d834d-022b-50b9-aac6-c5e7a6ba3b24', 'authenticated', 'authenticated', 'mathilde@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Mathilde Favre"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '6b482648-f341-5124-8e24-a57481728a47', 'authenticated', 'authenticated', 'tom@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Tom Berger"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '17bbcb90-e3e0-588a-96c3-fc31929ba1b5', 'authenticated', 'authenticated', 'nadia@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Nadia Benali"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '20e621a1-6bb3-5ed7-94da-c34de9609f7c', 'authenticated', 'authenticated', 'stefan@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Stefan Meier"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'e8dd8168-b0f5-5ce6-8116-b3e9c5dffaff', 'authenticated', 'authenticated', 'camille@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Camille Dupraz"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '56bf0fa3-2241-54d7-a663-ad456f4a10b0', 'authenticated', 'authenticated', 'ricardo@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Ricardo Mota"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '9da874e4-b654-5d65-a462-0d9ccb9de678', 'authenticated', 'authenticated', 'hugo@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Hugo Steiner"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'cfdfe275-2e7a-5aa8-913a-fa0754ba383f', 'authenticated', 'authenticated', 'ingrid@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Ingrid Johansson"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'a9a0cf01-e56b-5e2b-b0fe-743851992bd3', 'authenticated', 'authenticated', 'yann@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Yann Broillet"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '396eaacc-7544-51e4-b07f-8abf25e365c8', 'authenticated', 'authenticated', 'sarah@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Sarah Cohen"}', now(), now(), '', '', '', '');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'cb58436c-e5d2-5422-80cc-9d458d151d7d', 'authenticated', 'authenticated', 'antoine@demo.dispo.ch', crypt('jamconnect-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Antoine Vullioud"}', now(), now(), '', '', '', '');

-- Profils complets (le trigger a créé la ligne, on la complète)
update public.profiles set
  age = 42, neighborhood = 'Carouge', latitude = 46.1812, longitude = 6.1394,
  instruments = array['Percussions']::text[], genres = array['Latin / World','Jazz']::text[], level = 'Professionnel',
  bio = 'Congas, timbales, bongos. 20 ans de son cubain. J''organise des descargas chez moi à Carouge.', available_dates = array[current_date, current_date + 2]::date[], repertoire = array['Manteca','Oye Como Va','Guantanamera','El Cuarto de Tula']::text[], photo_url = 'pfp_marco'
where id = '5b07c949-eb23-5cac-b866-1d10dc67abd5';
update public.profiles set
  age = 29, neighborhood = 'Plainpalais', latitude = 46.1957, longitude = 6.1417,
  instruments = array['Voix']::text[], genres = array['Latin / World','Gospel / Soul / R&B']::text[], level = 'Avancé',
  bio = 'Chanteuse lusophone — bossa, salsa, soul. Je cherche un pianiste pour un duo régulier.', available_dates = array[current_date + 1, current_date + 3]::date[], repertoire = array['Garota de Ipanema','Bésame Mucho','Ain''t No Sunshine']::text[], photo_url = 'pfp_sofia'
where id = '0c99c694-fafc-5ad8-a19c-f9717d5f55d3';
update public.profiles set
  age = 35, neighborhood = 'Eaux-Vives', latitude = 46.2021, longitude = 6.1635,
  instruments = array['Contrebasse','Basse']::text[], genres = array['Jazz']::text[], level = 'Avancé',
  bio = 'Contrebassiste, fan de Mingus. Dispo la plupart des soirs après 19h.', available_dates = array[current_date, current_date + 2]::date[], repertoire = array['Autumn Leaves','All The Things You Are','So What','Blue Bossa']::text[], photo_url = 'pfp_julien'
where id = '1912d9b6-90aa-51be-a69c-d5094c9e681f';
update public.profiles set
  age = 31, neighborhood = 'Champel', latitude = 46.1884, longitude = 6.1562,
  instruments = array['Violon']::text[], genres = array['Classique','Folk / Acoustique']::text[], level = 'Professionnel',
  bio = 'Violoniste au Conservatoire. Je cherche un quatuor amateur motivé pour du Brahms.', available_dates = array[current_date + 12]::date[], repertoire = array['Brahms — Quatuor op. 51','Dvořák — Quatuor américain','Bach — Partitas']::text[], photo_url = 'pfp_anna'
where id = '0b92f4a4-3a8f-5b7e-b41b-577f5d65cc14';
update public.profiles set
  age = 38, neighborhood = 'Jonction', latitude = 46.1983, longitude = 6.1281,
  instruments = array['Batterie']::text[], genres = array['Jazz','Latin / World']::text[], level = 'Avancé',
  bio = 'Batteur jazz, à l''aise en latin (songo, mambo). Mon studio à la Jonction est équipé.', available_dates = array[current_date, current_date + 2]::date[], repertoire = array['Take Five','Spain','A Night in Tunisia']::text[], photo_url = 'pfp_david'
where id = '10dd36a7-9a8c-51e3-bc08-631398d13eec';
update public.profiles set
  age = 26, neighborhood = 'Pâquis', latitude = 46.2131, longitude = 6.1478,
  instruments = array['Flûte']::text[], genres = array['Classique','Jazz']::text[], level = 'Intermédiaire',
  bio = 'Flûtiste, 12 ans de conservatoire, je me mets au jazz. Patience appréciée !', available_dates = '{}'::date[], repertoire = array['Debussy — Syrinx','Summertime','Blue Bossa']::text[], photo_url = 'pfp_elise'
where id = 'a368379a-dc49-5194-ac47-3374d0d28557';
update public.profiles set
  age = 33, neighborhood = 'Servette', latitude = 46.2159, longitude = 6.1312,
  instruments = array['Guitare']::text[], genres = array['Rock / Pop','Folk / Acoustique']::text[], level = 'Avancé',
  bio = 'Guitariste rock & folk. Covers de Hendrix à Radiohead. Cherche bassiste et batteur.', available_dates = array[current_date + ((6 - extract(dow from current_date)::int + 7) % 7), current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 1]::date[], repertoire = array['Little Wing','Karma Police','Wish You Were Here']::text[], photo_url = 'pfp_karim'
where id = '23fcbc32-a18d-5fde-b26d-c5507e458323';
update public.profiles set
  age = 24, neighborhood = 'Lancy', latitude = 46.1897, longitude = 6.1143,
  instruments = array['Basse']::text[], genres = array['Rock / Pop','Gospel / Soul / R&B']::text[], level = 'Intermédiaire',
  bio = 'Bassiste groove, fan de Vulfpeck. Dispo les week-ends.', available_dates = array[current_date + ((6 - extract(dow from current_date)::int + 7) % 7), current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 1]::date[], repertoire = array['Dean Town','Superstition','Come Together']::text[], photo_url = 'pfp_lea'
where id = '965f3dcc-0086-576d-9c29-ffc46ab4de19';
update public.profiles set
  age = 45, neighborhood = 'Onex', latitude = 46.1843, longitude = 6.1003,
  instruments = array['Trompette']::text[], genres = array['Latin / World','Jazz']::text[], level = 'Professionnel',
  bio = 'Trompettiste colombien. Salsa dura, boléro, mambo. J''ai joué 15 ans à Cali.', available_dates = array[current_date, current_date + 2]::date[], repertoire = array['El Preso','Llorarás','Mambo No. 5','Sing Sing Sing']::text[], photo_url = 'pfp_pablo'
where id = '6d023718-28d9-5b0f-b505-c090b5c7c311';
update public.profiles set
  age = 28, neighborhood = 'Vieille-Ville', latitude = 46.2005, longitude = 6.1472,
  instruments = array['Violoncelle']::text[], genres = array['Classique']::text[], level = 'Avancé',
  bio = 'Violoncelliste amatrice sérieuse. Répertoire romantique, sonates et musique de chambre.', available_dates = array[current_date + 12]::date[], repertoire = array['Schubert — Arpeggione','Fauré — Élégie','Beethoven — Sonates']::text[], photo_url = 'pfp_mathilde'
where id = 'a18d834d-022b-50b9-aac6-c5e7a6ba3b24';
update public.profiles set
  age = 22, neighborhood = 'Meyrin', latitude = 46.2338, longitude = 6.0801,
  instruments = array['Synthé / MAO']::text[], genres = array['Électronique']::text[], level = 'Intermédiaire',
  bio = 'Beatmaker et live set modulaire. Cherche voix et instrumentistes pour des sessions studio.', available_dates = array[current_date + 1, current_date + 3]::date[], repertoire = array['Sets house / ambient','Collabs hip-hop']::text[], photo_url = 'pfp_tom'
where id = '6b482648-f341-5124-8e24-a57481728a47';
update public.profiles set
  age = 36, neighborhood = 'Plainpalais', latitude = 46.1938, longitude = 6.1435,
  instruments = array['Voix','Piano']::text[], genres = array['Gospel / Soul / R&B','Jazz']::text[], level = 'Avancé',
  bio = 'Choriste gospel et pianiste. Je monte un petit chœur soul sur Genève.', available_dates = '{}'::date[], repertoire = array['Oh Happy Day','Feeling Good','Georgia On My Mind']::text[], photo_url = 'pfp_nadia'
where id = '17bbcb90-e3e0-588a-96c3-fc31929ba1b5';
update public.profiles set
  age = 51, neighborhood = 'Chêne-Bougeries', latitude = 46.1982, longitude = 6.1863,
  instruments = array['Saxophone']::text[], genres = array['Jazz']::text[], level = 'Avancé',
  bio = 'Sax ténor, habitué des scènes de l''AMR. Hard bop et ballades, dispo au pied levé.', available_dates = array[current_date, current_date + 2]::date[], repertoire = array['Body and Soul','Moanin''','Cantaloupe Island','Footprints']::text[], photo_url = 'pfp_stefan'
where id = '20e621a1-6bb3-5ed7-94da-c34de9609f7c';
update public.profiles set
  age = 30, neighborhood = 'Eaux-Vives', latitude = 46.2048, longitude = 6.1591,
  instruments = array['Guitare','Voix']::text[], genres = array['Folk / Acoustique']::text[], level = 'Intermédiaire',
  bio = 'Guitare acoustique et chant. Cercles folk au bord du lac l''été.', available_dates = array[current_date + ((6 - extract(dow from current_date)::int + 7) % 7), current_date + ((6 - extract(dow from current_date)::int + 7) % 7) + 1]::date[], repertoire = array['Both Sides Now','The Boxer','Compositions perso']::text[], photo_url = 'pfp_camille'
where id = 'e8dd8168-b0f5-5ce6-8116-b3e9c5dffaff';
update public.profiles set
  age = 39, neighborhood = 'Vernier', latitude = 46.2172, longitude = 6.0849,
  instruments = array['Guitare']::text[], genres = array['Latin / World']::text[], level = 'Avancé',
  bio = 'Guitariste brésilien — samba, bossa, choro. Cavaquinho aussi !', available_dates = array[current_date + 12]::date[], repertoire = array['Aquarela do Brasil','Wave','Tico-Tico no Fubá']::text[], photo_url = 'pfp_ricardo'
where id = '56bf0fa3-2241-54d7-a663-ad456f4a10b0';
update public.profiles set
  age = 27, neighborhood = 'Servette', latitude = 46.2201, longitude = 6.1289,
  instruments = array['Batterie']::text[], genres = array['Rock / Pop','Électronique']::text[], level = 'Intermédiaire',
  bio = 'Batteur rock, pads électro hybrides. Local de répète à la Servette.', available_dates = array[current_date + 1, current_date + 3]::date[], repertoire = array['Seven Nation Army','Time Is Running Out','Sets hybrides']::text[], photo_url = 'pfp_hugo'
where id = '9da874e4-b654-5d65-a462-0d9ccb9de678';
update public.profiles set
  age = 34, neighborhood = 'Champel', latitude = 46.1861, longitude = 6.1524,
  instruments = array['Piano']::text[], genres = array['Classique','Jazz']::text[], level = 'Professionnel',
  bio = 'Pianiste concertiste reconvertie au jazz. J''accompagne aussi des chanteurs.', available_dates = array[current_date, current_date + 2]::date[], repertoire = array['Chopin — Ballades','Misty','My Funny Valentine']::text[], photo_url = 'pfp_ingrid'
where id = 'cfdfe275-2e7a-5aa8-913a-fa0754ba383f';
update public.profiles set
  age = 41, neighborhood = 'Carouge', latitude = 46.1834, longitude = 6.1421,
  instruments = array['Contrebasse']::text[], genres = array['Latin / World','Jazz']::text[], level = 'Avancé',
  bio = 'Contrebasse et baby bass. Tumbaos salsa et walking jazz. Souvent au Chat Noir.', available_dates = array[current_date + 1, current_date + 3]::date[], repertoire = array['El Cantante','Caravan','Footprints']::text[], photo_url = 'pfp_yann'
where id = 'a9a0cf01-e56b-5e2b-b0fe-743851992bd3';
update public.profiles set
  age = 25, neighborhood = 'Pâquis', latitude = 46.2114, longitude = 6.1509,
  instruments = array['Voix']::text[], genres = array['Jazz']::text[], level = 'Intermédiaire',
  bio = 'Chanteuse jazz, répertoire Ella & Billie. Je cherche un trio pour progresser.', available_dates = array[current_date + 12]::date[], repertoire = array['Summertime','Fly Me to the Moon','God Bless the Child']::text[], photo_url = 'pfp_sarah'
where id = '396eaacc-7544-51e4-b07f-8abf25e365c8';
update public.profiles set
  age = 47, neighborhood = 'Jonction', latitude = 46.1966, longitude = 6.1325,
  instruments = array['Piano','Synthé / MAO']::text[], genres = array['Gospel / Soul / R&B','Électronique']::text[], level = 'Avancé',
  bio = 'Claviers Rhodes & orgue Hammond. Soul, funk, neo-soul. Home studio équipé.', available_dates = '{}'::date[], repertoire = array['What''s Going On','Lovely Day','Compositions neo-soul']::text[], photo_url = 'pfp_antoine'
where id = 'cb58436c-e5d2-5422-80cc-9d458d151d7d';

-- Appréciations (avis positifs du seed)
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('0c99c694-fafc-5ad8-a19c-f9717d5f55d3', '5b07c949-eb23-5cac-b866-1d10dc67abd5', 'golden', 'Groove incroyable, très accueillant.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('1912d9b6-90aa-51be-a69c-d5094c9e681f', '5b07c949-eb23-5cac-b866-1d10dc67abd5', 'golden', 'La clave dans le sang. Il a sauvé notre soirée salsa.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('5b07c949-eb23-5cac-b866-1d10dc67abd5', '0c99c694-fafc-5ad8-a19c-f9717d5f55d3', 'golden', 'Une voix qui transforme n''importe quel concert.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('0b92f4a4-3a8f-5b7e-b41b-577f5d65cc14', '1912d9b6-90aa-51be-a69c-d5094c9e681f', 'note', 'Solide walking bass, très bon niveau.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('10dd36a7-9a8c-51e3-bc08-631398d13eec', '1912d9b6-90aa-51be-a69c-d5094c9e681f', 'golden', 'Le pilier de n''importe quel groupe. Fiable à 200 %.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('a368379a-dc49-5194-ac47-3374d0d28557', '0b92f4a4-3a8f-5b7e-b41b-577f5d65cc14', 'golden', 'Rigoureuse et pédagogue.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('1912d9b6-90aa-51be-a69c-d5094c9e681f', '10dd36a7-9a8c-51e3-bc08-631398d13eec', 'golden', 'Swing impeccable, studio top.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('5b07c949-eb23-5cac-b866-1d10dc67abd5', '10dd36a7-9a8c-51e3-bc08-631398d13eec', 'note', 'Très bon feel latin.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('965f3dcc-0086-576d-9c29-ffc46ab4de19', '23fcbc32-a18d-5fde-b26d-c5507e458323', 'note', 'Très bon son, super énergie.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('23fcbc32-a18d-5fde-b26d-c5507e458323', '965f3dcc-0086-576d-9c29-ffc46ab4de19', 'golden', 'Le groove est là. Fiable et ponctuelle.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('5b07c949-eb23-5cac-b866-1d10dc67abd5', '6d023718-28d9-5b0f-b505-c090b5c7c311', 'golden', 'Un son de cuivre exceptionnel.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('0c99c694-fafc-5ad8-a19c-f9717d5f55d3', '6d023718-28d9-5b0f-b505-c090b5c7c311', 'golden', 'Le feu. La section cuivre rêvée.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('0b92f4a4-3a8f-5b7e-b41b-577f5d65cc14', 'a18d834d-022b-50b9-aac6-c5e7a6ba3b24', 'golden', 'Très belle sonorité, engagée.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('0c99c694-fafc-5ad8-a19c-f9717d5f55d3', '17bbcb90-e3e0-588a-96c3-fc31929ba1b5', 'golden', 'Harmonies magnifiques.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('10dd36a7-9a8c-51e3-bc08-631398d13eec', '20e621a1-6bb3-5ed7-94da-c34de9609f7c', 'note', 'Beau phrasé, belle écoute.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('0c99c694-fafc-5ad8-a19c-f9717d5f55d3', '56bf0fa3-2241-54d7-a663-ad456f4a10b0', 'golden', 'La bossa comme à Rio.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('23fcbc32-a18d-5fde-b26d-c5507e458323', '9da874e4-b654-5d65-a462-0d9ccb9de678', 'note', 'Frappe solide, bon local.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('17bbcb90-e3e0-588a-96c3-fc31929ba1b5', 'cfdfe275-2e7a-5aa8-913a-fa0754ba383f', 'golden', 'Un toucher exceptionnel.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('6d023718-28d9-5b0f-b505-c090b5c7c311', 'a9a0cf01-e56b-5e2b-b0fe-743851992bd3', 'golden', 'Tumbao d''enfer.');
insert into public.appreciations (giver_id, receiver_id, kind, comment) values ('965f3dcc-0086-576d-9c29-ffc46ab4de19', 'cb58436c-e5d2-5422-80cc-9d458d151d7d', 'golden', 'Le son Rhodes parfait.');

-- Annonces SOS (dates projetées sur les prochains jours)
insert into public.gig_requests (id, host_id, title, date, place, neighborhood, genre, wanted_instruments, fee, description, posted_at)
values ('6e1deb6a-9d2b-4a3c-8f5e-0a1b2c3d4e01', '5b07c949-eb23-5cac-b866-1d10dc67abd5', 'Cherche pianiste — soirée salsa', now() + interval '1 days' + interval '4 hours', 'Le Chat Noir', 'Carouge', 'Latin / World', array['Piano']::text[], 150, 'Notre pianiste s''est blessé à la main. Soirée salsa complète (Manteca, El Cuarto de Tula, Llorarás…). Setlist envoyée à l''avance, balance à 18h30, cachet payé le soir même.', now() - interval '5 minutes');
insert into public.gig_requests (id, host_id, title, date, place, neighborhood, genre, wanted_instruments, fee, description, posted_at)
values ('6e1deb6a-9d2b-4a3c-8f5e-0a1b2c3d4e02', '20e621a1-6bb3-5ed7-94da-c34de9609f7c', 'SOS batteur — trio jazz', now() + interval '2 days' + interval '4 hours', 'AMR — Sud des Alpes', 'Pâquis', 'Jazz', array['Batterie']::text[], 120, 'Notre batteur est coincé à l''étranger, vol annulé. Standards du Real Book (Autumn Leaves, Footprints, Blue Bossa). Lecture facile, brushes indispensables.', now() - interval '4 hours');
insert into public.gig_requests (id, host_id, title, date, place, neighborhood, genre, wanted_instruments, fee, description, posted_at)
values ('6e1deb6a-9d2b-4a3c-8f5e-0a1b2c3d4e03', '23fcbc32-a18d-5fde-b26d-c5507e458323', 'Bassiste pour covers rock', now() + interval '3 days' + interval '4 hours', 'Bar des Volontaires', 'Jonction', 'Rock / Pop', array['Basse']::text[], 100, 'Notre bassiste a une angine carabinée. Set de covers (Hendrix, Muse, Radiohead), 2×45 min. Ampli fourni sur place, tablatures dispo.', now() - interval '5 hours');
insert into public.gig_requests (id, host_id, title, date, place, neighborhood, genre, wanted_instruments, fee, description, posted_at)
values ('6e1deb6a-9d2b-4a3c-8f5e-0a1b2c3d4e04', '0b92f4a4-3a8f-5b7e-b41b-577f5d65cc14', 'Second violon — concert caritatif', now() + interval '4 days' + interval '4 hours', 'Temple de la Fusterie', 'Vieille-Ville', 'Classique', array['Violon']::text[], null, 'Notre second violon a un empêchement familial. Quatuor américain de Dvořák + pièces courtes. Partitions envoyées immédiatement, une répétition prévue la veille.', now() - interval '6 hours');
insert into public.gig_requests (id, host_id, title, date, place, neighborhood, genre, wanted_instruments, fee, description, posted_at)
values ('6e1deb6a-9d2b-4a3c-8f5e-0a1b2c3d4e05', 'e8dd8168-b0f5-5ce6-8116-b3e9c5dffaff', 'Guitariste-chanteur pour mariage', now() + interval '5 days' + interval '4 hours', 'Domaine au bord du lac', 'Eaux-Vives', 'Folk / Acoustique', array['Guitare','Voix']::text[], 250, 'Le duo prévu s''est désisté à une semaine du mariage ! Set acoustique cocktail (2h), répertoire folk/pop doux. Les mariés sont adorables, cadre magnifique.', now() - interval '7 hours');
