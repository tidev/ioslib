#! groovy
library 'pipeline-library'

def nodeVersion = '8.9.1'
def MAINLINE_BRANCH_REGEXP = /master|\d_\d_(X|\d)/ // a branch is considered mainline if 'master' or like: 1_7_X
def isPublishable = false // used to determine if we should publish
timestamps {
  node('osx && npm-publish') {
    def packageVersion = ''
    stage('Checkout') {
      // checkout scm
      // Hack for JENKINS-37658 - see https://support.cloudbees.com/hc/en-us/articles/226122247-How-to-Customize-Checkout-for-Pipeline-Multibranch
      checkout([
        $class: 'GitSCM',
        branches: scm.branches,
        extensions: scm.extensions + [[$class: 'CleanBeforeCheckout']],
        userRemoteConfigs: scm.userRemoteConfigs
      ])

      packageVersion = jsonParse(readFile('package.json'))['version']
      isPublishable = (env.BRANCH_NAME ==~ MAINLINE_BRANCH_REGEXP)
      currentBuild.displayName = "#${packageVersion}-${currentBuild.number}"
    }

    nodejs(nodeJSInstallationName: "node ${nodeVersion}") {
      ansiColor('xterm') {
        timeout(15) {
          stage('Build') {
            // Install yarn if not installed
            if (sh(returnStatus: true, script: 'which yarn') != 0) {
              sh 'npm install -g yarn'
            }
            sh 'yarn install'
            try {
              withEnv(['TRAVIS=true', 'JUNIT_REPORT_PATH=junit_report.xml']) {
                sh 'yarn test'
              }
            } catch (e) {
              throw e
            } finally {
              junit 'junit_report.xml'
            }
            fingerprint 'package.json'
            // Only tag publishable branches
            if (isPublishable) {
              pushGitTag(name: packageVersion, message: "See ${env.BUILD_URL} for more information.", force: true)
            }
          } // stage
        } // timeout

        stage('Security') {
          // Clean up and install only production dependencies
          sh 'yarn install --production'

          // Scan for NSP and RetireJS warnings
          sh 'yarn global add nsp'
          sh 'nsp check --output summary --warn-only'

          sh 'yarn global add retire'
          sh 'retire --exitwith 0'

          // TODO Run node-check-updates

          step([$class: 'WarningsPublisher', canComputeNew: false, canResolveRelativePaths: false, consoleParsers: [[parserName: 'Node Security Project Vulnerabilities'], [parserName: 'RetireJS']], defaultEncoding: '', excludePattern: '', healthy: '', includePattern: '', messagesPattern: '', unHealthy: ''])
        } // stage

        stage('Publish') {
          // only publish master and trigger downstream
          if (isPublishable) {
            sh 'npm publish'
          }
        } // stage

        stage('JIRA') {
          if (isPublishable) {
            // update affected tickets, create and release version
            updateJIRA('TIMOB', "ioslib ${packageVersion}", scm)
          } // if
        } // stage(JIRA)
      } // ansiColor
    } //nodejs
  } // node
} // timestamps
