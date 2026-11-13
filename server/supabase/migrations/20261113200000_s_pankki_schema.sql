-- Junction 2026 S-Pankki dataset.
-- Timestamps in the source CSVs use SAS format (e.g. 03OCT24:09:04:04) and are
-- converted to `timestamp` by the loader. No time zone is given in the data.

create table if not exists customers (
  customer_id          text primary key,
  customer_postal_code text not null,
  customer_age         smallint not null
);

create table if not exists transactions (
  customer_id       text not null references customers (customer_id),
  bank_account_id   text not null,
  tx_date           date not null,
  tx_timestamp      timestamp not null,
  category          text not null,
  tx_amount_eur     numeric(12, 2) not null,
  balance_after_eur numeric(12, 2) not null,
  transaction_type  text not null,
  merchant_id       text,
  mcc_code          text
);

create table if not exists mortgage_applications (
  mortgage_customer_id        text primary key,
  customer_id                 text not null unique references customers (customer_id),
  final_decision              text not null,
  rejection_reason            text,
  final_property_price_eur    numeric(12, 2),
  final_requested_loan_eur    numeric(12, 2),
  final_equity_amount_eur     numeric(12, 2),
  final_collateral_value_eur  numeric(12, 2),
  required_monthly_income_eur double precision,
  final_loan_to_value         double precision  -- source column: lfinal_loan_to_value
);

create table if not exists mortgage_events (
  id                      bigint generated always as identity primary key,
  mortgage_customer_id    text not null references mortgage_applications (mortgage_customer_id),
  event_timestamp         timestamp not null,  -- source column: timestamp
  event_type              text not null,
  property_id             text,
  property_type           text,
  property_price_estimate numeric(12, 2),
  loan_amount             numeric(12, 2),
  equity_amount           numeric(12, 2),
  collateral_type         text,
  collateral_value        numeric(12, 2),
  collateral_status       text,
  decision                text,
  rejection_reason        text,
  expense_type            text,
  expense_amount          numeric(12, 2),
  note                    text
);

-- RLS on, no policies: only the service role / direct DB connections can read.
alter table customers enable row level security;
alter table transactions enable row level security;
alter table mortgage_applications enable row level security;
alter table mortgage_events enable row level security;

create index if not exists transactions_customer_ts_idx on transactions (customer_id, tx_timestamp);
create index if not exists mortgage_events_customer_ts_idx on mortgage_events (mortgage_customer_id, event_timestamp);
