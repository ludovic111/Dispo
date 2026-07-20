-- Les anciens builds écrivaient le centre de Genève comme position de tous
-- les vrais profils. Avec la géoloc réelle (0.9.4), une coordonnée présente
-- signifie « position partagée » : on remet donc à NULL les placeholders des
-- profils réels. Les profils de démo gardent leurs positions d'exemple.

update public.profiles
set latitude = null, longitude = null
where is_demo = false;
