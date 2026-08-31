Pod::Spec.new do |s|
  s.name           = 'DispoLegacyPreferences'
  s.version        = '1.0.0'
  s.summary        = 'Read-only migration of previous Dispo native preferences'
  s.description    = 'Preserves user choices when upgrading the native clients to Expo.'
  s.author         = 'Dispo'
  s.homepage       = 'https://dispoapp.net'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = "Tests/**/*"
end
