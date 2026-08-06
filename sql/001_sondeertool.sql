-- Sondeertool: logging en aanvragen
-- Optioneel. Zonder deze tabellen werkt de tool ook, alleen zonder opslag.

create table if not exists sondeer_opvraging (
  id                  bigserial primary key,
  zoekterm            text,
  lat                 double precision,
  lon                 double precision,
  straal_km           numeric(4,2),
  aantal_gevonden     integer,
  aantal_geanalyseerd integer,
  duur_ms             integer,
  ip                  text,
  user_agent          text,
  aangemaakt_op       timestamptz not null default now()
);

create index if not exists sondeer_opvraging_datum_idx
  on sondeer_opvraging (aangemaakt_op desc);

create index if not exists sondeer_opvraging_locatie_idx
  on sondeer_opvraging (lat, lon);

create table if not exists sondeer_aanvraag (
  id            bigserial primary key,
  naam          text not null,
  email         text not null,
  telefoon      text,
  adres         text not null,
  toelichting   text,
  lat           double precision,
  lon           double precision,
  bro_id        text,
  ip            text,
  status        text not null default 'nieuw',
  aangemaakt_op timestamptz not null default now()
);

create index if not exists sondeer_aanvraag_status_idx
  on sondeer_aanvraag (status, aangemaakt_op desc);

-- Optioneel: cache van geparseerde sonderingen, zodat je na een herstart van
-- de container niet opnieuw megabytes XML bij de BRO hoeft op te halen.
create table if not exists sondeer_cache (
  bro_id        text primary key,
  lat           double precision,
  lon           double precision,
  maaiveld_nap  numeric(6,2),
  einddiepte    numeric(6,2),
  datum         date,
  payload       jsonb not null,
  opgehaald_op  timestamptz not null default now()
);

create index if not exists sondeer_cache_locatie_idx
  on sondeer_cache (lat, lon);
