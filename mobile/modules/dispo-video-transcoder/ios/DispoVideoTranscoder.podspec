Pod::Spec.new do |s|
  s.name           = 'DispoVideoTranscoder'
  s.version        = '1.0.0'
  s.summary        = 'Local portfolio video transcoding for Dispo'
  s.description    = 'Produces upload-ready H.264 MP4 video without sending source media off-device.'
  s.author         = 'Dispo'
  s.homepage       = 'https://dispoapp.net'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CoreVideo'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
