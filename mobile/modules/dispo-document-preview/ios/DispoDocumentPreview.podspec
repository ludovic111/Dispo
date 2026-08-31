Pod::Spec.new do |s|
  s.name           = 'DispoDocumentPreview'
  s.version        = '1.0.0'
  s.summary        = 'Private native document previews for Dispo'
  s.description    = 'Downloads a short-lived signed document into the private cache and presents it with Quick Look.'
  s.author         = 'Dispo'
  s.homepage       = 'https://dispoapp.net'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'QuickLook'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
