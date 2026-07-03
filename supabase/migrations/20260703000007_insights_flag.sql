-- 營運儀表板 feature flag（頁面本身 admin 限定，無新表）
INSERT INTO system_settings (key, value)
VALUES ('feature.insights', 'false')
ON CONFLICT (key) DO NOTHING;
