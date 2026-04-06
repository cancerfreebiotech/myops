-- Feature flags: one row per feature, value 'true'/'false'
INSERT INTO system_settings (key, value) VALUES
  ('feature.attendance',    'false'),
  ('feature.leave',         'false'),
  ('feature.overtime',      'false'),
  ('feature.payroll',       'false'),
  ('feature.documents',     'false'),
  ('feature.announcements', 'false'),
  ('feature.contracts',     'false'),
  ('feature.projects',      'false'),
  ('feature.feedback',      'true')
ON CONFLICT (key) DO NOTHING;
