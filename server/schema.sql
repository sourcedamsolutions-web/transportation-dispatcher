create table if not exists users (
  id serial primary key,
  name text unique not null,
  pin_hash text not null,
  role text not null check (role in ('admin','supervisor','dispatcher')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists routes (
  id serial primary key,
  code text unique not null,
  category text not null,
  requires_assistant boolean not null default false,
  default_driver text,
  default_assistant text,
  bus text
);

create table if not exists day_sheets (
  id serial primary key,
  day date unique not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
