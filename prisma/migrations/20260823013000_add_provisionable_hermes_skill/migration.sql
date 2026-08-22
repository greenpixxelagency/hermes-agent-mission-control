-- M15 closeout: the isolated staging adapter allowlists this official,
-- image-bundled Hermes skill as its sole typed provisioning target.
INSERT INTO "Skill" (
    "id", "slug", "name", "description", "category", "sourceType",
    "sourceIdentifier", "version", "trustStatus", "isEnabled", "createdAt", "updatedAt"
) VALUES (
    'skill_one_three_one_rule',
    'one-three-one-rule',
    '1-3-1 Communication',
    'Structure concise updates as one issue, three options, and one recommendation.',
    'Communication',
    'SYSTEM',
    'one-three-one-rule',
    '1.0.0',
    'TRUSTED',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
