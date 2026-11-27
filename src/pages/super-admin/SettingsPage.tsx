import { debugLogger } from '../../lib/debugLogger';
import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import systemLogService, { GlobalSettings } from '../../services/systemLogService';
import { Settings, Zap, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
export default function SuperAdminSettingsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [settings, setSettings] = useState<GlobalSettings>({
    maxJobPostsPerWeek: 5,
    maxServicePostsPerWeek: 3,
    maxApplicationsPerDay: 10,
    enableNotifications: true,
    enableModeration: true,
    maintenanceMode: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Subscribe to real-time settings updates
  useEffect(() => {
    const unsubscribe = systemLogService.subscribeGlobalSettings(
      (newSettings) => {
        setSettings(newSettings);
        setLoading(false);
      },
      (error) => {
        debugLogger.error('Error loading settings:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSettingChange = (key: keyof GlobalSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    if (!profile?.uid) return;

    setSaving(true);
    setErrorMessage('');
    setSaveStatus('idle');

    const success = await systemLogService.updateGlobalSettings(settings, profile.uid);

    if (success) {
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } else {
      setSaveStatus('error');
      setErrorMessage(t('super_admin.settings_save_error'));
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-spin">
              <div className="w-12 h-12 bg-indigo-500 rounded-full" />
            </div>
            <p className="text-gray-600 font-medium">{t('common.loading')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
            <Settings size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{t('super_admin.settings_title')}</h1>
            <p className="text-gray-500 text-sm font-medium">{t('super_admin.settings_sub')}</p>
          </div>
        </div>

        {/* Status Messages */}
        {saveStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3"
          >
            <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            <p className="text-green-700 font-medium">{t('super_admin.settings_saved')}</p>
          </motion.div>
        )}

        {saveStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3"
          >
            <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
            <p className="text-red-700 font-medium">{errorMessage}</p>
          </motion.div>
        )}

        {/* Rate Limiting Settings */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
          <div>
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Zap size={20} className="text-amber-500" />
              {t('super_admin.nav_matching')}
            </h2>
            <p className="text-xs text-gray-500 mt-1">{t('super_admin.max_posts_limit_sub')}</p>
          </div>

          <div className="space-y-6">
            {/* Max Job Posts Per Week */}
            <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-50/50 rounded-2xl border border-blue-100">
              <label className="block mb-3">
                <p className="text-sm font-black text-gray-900 mb-2">
                  {t('super_admin.max_job_posts')}
                </p>
                <p className="text-xs text-gray-500 mb-3">{t('super_admin.seven_days_period')}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.maxJobPostsPerWeek}
                    onChange={(e) => handleSettingChange('maxJobPostsPerWeek', parseInt(e.target.value) || 1)}
                    className="w-20 px-4 py-2 border border-blue-200 rounded-xl text-center font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-sm font-medium text-gray-600">{t('super_admin.posts_unit')}</span>
                </div>
              </label>
              <p className="text-xs text-blue-600 mt-3 font-medium">
                {t('super_admin.current_val_week', { count: settings.maxJobPostsPerWeek })}
              </p>
            </div>

            {/* Max Service Posts Per Week */}
            <div className="p-6 bg-gradient-to-br from-green-50 to-green-50/50 rounded-2xl border border-green-100">
              <label className="block mb-3">
                <p className="text-sm font-black text-gray-900 mb-2">
                  {t('super_admin.max_service_posts')}
                </p>
                <p className="text-xs text-gray-500 mb-3">{t('super_admin.seven_days_period')}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.maxServicePostsPerWeek}
                    onChange={(e) => handleSettingChange('maxServicePostsPerWeek', parseInt(e.target.value) || 1)}
                    className="w-20 px-4 py-2 border border-green-200 rounded-xl text-center font-bold text-green-600 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <span className="text-sm font-medium text-gray-600">{t('super_admin.posts_unit')}</span>
                </div>
              </label>
              <p className="text-xs text-green-600 mt-3 font-medium">
                {t('super_admin.current_val_week', { count: settings.maxServicePostsPerWeek })}
              </p>
            </div>

            {/* Max Applications Per Day */}
            <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-50/50 rounded-2xl border border-purple-100">
              <label className="block mb-3">
                <p className="text-sm font-black text-gray-900 mb-2">
                  {t('super_admin.max_daily_apps')}
                </p>
                <p className="text-xs text-gray-500 mb-3">{t('super_admin.within_day')}</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.maxApplicationsPerDay}
                    onChange={(e) => handleSettingChange('maxApplicationsPerDay', parseInt(e.target.value) || 1)}
                    className="w-20 px-4 py-2 border border-purple-200 rounded-xl text-center font-bold text-purple-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <span className="text-sm font-medium text-gray-600">{t('super_admin.apps_unit')}</span>
                </div>
              </label>
              <p className="text-xs text-purple-600 mt-3 font-medium">
                {t('super_admin.current_val_day', { count: settings.maxApplicationsPerDay })}
              </p>
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-6">
          <h2 className="text-lg font-black text-gray-900">{t('super_admin.system_features')}</h2>

          <div className="space-y-4">
            {/* Enable Notifications */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <p className="font-bold text-gray-900">{t('super_admin.enable_push_notifications')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('super_admin.push_notifications_sub')}</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableNotifications', !settings.enableNotifications)}
                className={`w-14 h-8 rounded-full transition-all ${
                  settings.enableNotifications ? 'bg-green-500' : 'bg-gray-300'
                } flex items-center justify-start p-1`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full transition-transform ${
                    settings.enableNotifications ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            {/* Enable Moderation */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <p className="font-bold text-gray-900">{t('super_admin.content_moderation')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('super_admin.content_moderation_sub')}</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableModeration', !settings.enableModeration)}
                className={`w-14 h-8 rounded-full transition-all ${
                  settings.enableModeration ? 'bg-green-500' : 'bg-gray-300'
                } flex items-center justify-start p-1`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full transition-transform ${
                    settings.enableModeration ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>

            {/* Maintenance Mode */}
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
              <div>
                <p className="font-bold text-gray-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  {t('super_admin.maintenance_mode')}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('super_admin.maintenance_mode_sub')}</p>
              </div>
              <button
                onClick={() => handleSettingChange('maintenanceMode', !settings.maintenanceMode)}
                className={`w-14 h-8 rounded-full transition-all ${
                  settings.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'
                } flex items-center justify-start p-1`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full transition-transform ${
                    settings.maintenanceMode ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl transition-all shadow-lg"
          >
            {saving ? t('common.saving') : t('common.save')}
          </motion.button>
        </div>
      </div>
    </DashboardLayout>
  );
}
