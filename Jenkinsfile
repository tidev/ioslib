#! groovy
library 'pipeline-library'
// TODO: Could we make this an array and test across multiple major versions
def nodeVersion = '8.9.1'

def unitTests(os, nodeVersion) {
  return {
    node(os) {
      nodejs(nodeJSInstallationName: "node ${nodeVersion}") {
        stage('Test') {
          timeout(15) {
            unstash 'sources'
            if (sh(returnStatus: true, script: 'which yarn') != 0) {
              sh 'npm install -g yarn'
            }
            sh 'yarn install'
            fingerprint 'package.json'
            try {
              sh 'yarn run coverage'
            } finally {
              // record results even if tests/coverage 'fails'
              junit 'junit.xml'
            }
          } // timeout
        } // test
      } // nodejs
    }  // node
  }
}

timestamps {
  def isMaster = false
  def packageVersion

  node('osx') {
    stage('Checkout') {
      // checkout scm
      // Hack for JENKINS-37658 - see https://support.cloudbees.com/hc/en-us/articles/226122247-How-to-Customize-Checkout-for-Pipeline-Multibranch
      // do a git clean before checking out
      checkout([
        $class: 'GitSCM',
        branches: scm.branches,
        extensions: scm.extensions + [[$class: 'CleanBeforeCheckout']],
        userRemoteConfigs: scm.userRemoteConfigs
      ])

      isMaster = env.BRANCH_NAME.equals('master')
      packageVersion = jsonParse(readFile('package.json'))['version']
      currentBuild.displayName = "#${packageVersion}-${currentBuild.number}"
      stash allowEmpty: true, name: 'sources', useDefaultExcludes: false
    }
  }

  stage('Test') {
    parallel(
      'OSX unit tests': unitTests('osx', nodeVersion),
      failFast: false
	)
  } // Test

} // timestamps