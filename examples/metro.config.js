const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('path')

/**
 * Metro configuration for an RN app that consumes a sibling shared package.
 *
 * This app is STANDALONE: it is deliberately NOT a member of the root npm
 * workspaces, so RN build tooling never hoists to the repo root and mangles the
 * Android composite gradle-plugin build. It has its own complete node_modules.
 *
 * `@org/shared` arrives as a `file:../shared` dependency. npm symlinks it into
 * ./node_modules/@org/shared, but its SOURCE physically lives at <repo-root>/shared,
 * OUTSIDE this app. Two consequences Metro must handle:
 *
 * 1. The shared .ts source is outside projectRoot, so Metro will not serve it by
 *    default. Fix: add <repo-root> to watchFolders.
 *
 * 2. When a shared file imports a bare dep (say `zustand`), Metro's upward
 *    node_modules walk starts at <repo-root>/shared and climbs to
 *    <repo-root>/node_modules, a DIFFERENT physical copy than this app's. A split
 *    like that means the shared store and the app code hold TWO instances (log in
 *    on a shared screen, the app never sees it); react splits into the
 *    useRef-null invalid-hook crash; native modules register twice. Fix: pin
 *    EVERY dep shared between the shared package and this app to the local copy
 *    via resolveRequest, so there is exactly one instance.
 *
 * KEEP THIS LIST IN SYNC WITH THE OTHER APP'S metro.config.js. Both consume the
 * same shared package and need the identical pin set.
 *
 * Regenerate the list mechanically rather than from memory:
 *   grep -rhoE "from '[^.@][^']*'|from '@[^/]+/[^']+'" ../shared/src \
 *     | sed "s/from '//;s/'$//" | cut -d/ -f1-2 | sort -u
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const localModules = path.resolve(projectRoot, 'node_modules')
const localCopy = (name) => path.resolve(localModules, name)

const singletons = {
  // React stack. Stateful singletons; a split is the useRef-null crash.
  // `react/jsx-runtime` is a SUBPATH and is covered by the startsWith match below.
  react: localCopy('react'),
  'react-native': localCopy('react-native'),
  scheduler: localCopy('scheduler'),
  'react-is': localCopy('react-is'),

  // HTTP client. Fixes both version duplication and split interceptor state.
  axios: localCopy('axios'),

  // Stateful store. MUST be one instance across shared screens and the app shell.
  zustand: localCopy('zustand'),

  // Native single-instance modules. Double registration breaks them.
  '@react-native-async-storage/async-storage': localCopy(
    '@react-native-async-storage/async-storage',
  ),
  '@react-native-community/geolocation': localCopy(
    '@react-native-community/geolocation',
  ),
  'react-native-safe-area-context': localCopy('react-native-safe-area-context'),
  'react-native-vector-icons': localCopy('react-native-vector-icons'),
  '@react-native-firebase/crashlytics': localCopy(
    '@react-native-firebase/crashlytics',
  ),
}

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    resolveRequest: (context, moduleName, platform) => {
      for (const name of Object.keys(singletons)) {
        if (moduleName === name || moduleName.startsWith(name + '/')) {
          const remainder = moduleName.slice(name.length) // '' or '/subpath'
          return context.resolveRequest(
            context,
            singletons[name] + remainder,
            platform,
          )
        }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
  },
}

module.exports = mergeConfig(getDefaultConfig(projectRoot), config)
