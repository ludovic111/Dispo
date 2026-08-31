Pod::Spec.new do |s|
  s.name           = 'DispoSongAnalysis'
  s.version        = '1.0.0'
  s.summary        = 'Local preview analysis for Dispo repertoire songs'
  s.description    = 'Decodes an official preview locally to suggest key and tempo without uploading audio.'
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
end
