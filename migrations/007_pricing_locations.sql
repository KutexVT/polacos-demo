-- Existing costs and requested percentages are unknown; keep them unset.
ALTER TABLE products ADD COLUMN purchase_cost bigint CHECK(purchase_cost BETWEEN 1 AND 1000000000000);
ALTER TABLE products ADD COLUMN profit_percent numeric(7,2) CHECK(profit_percent BETWEEN 0 AND 10000);
ALTER TABLE products ADD CONSTRAINT product_cost_and_percent CHECK((purchase_cost IS NULL)=(profit_percent IS NULL));
ALTER TABLE clients ADD COLUMN canton text NOT NULL DEFAULT '' CHECK(length(canton)<=100);
ALTER TABLE clients ADD COLUMN province text NOT NULL DEFAULT '' CHECK(length(province)<=100);
ALTER TABLE price_requests ADD COLUMN discount_percent numeric(5,2) CHECK(discount_percent>=0 AND discount_percent<100);
