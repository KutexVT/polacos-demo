-- This copy has its own database. Only these two seeded profiles have direct entry.
CREATE TABLE demo_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
 polaco_id uuid REFERENCES users(id) ON DELETE SET NULL,
 seeded_at timestamptz NOT NULL DEFAULT now()
);
