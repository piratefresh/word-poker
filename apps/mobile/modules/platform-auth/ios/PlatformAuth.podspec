Pod::Spec.new do |s|
  s.name           = 'PlatformAuth'
  s.version        = '1.0.0'
  s.summary        = 'Game Center and Play Games identity evidence for Word Poker'
  s.description    = 'Local Expo module: platform sign-in state and server-verifiable identity proofs.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'GameKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
