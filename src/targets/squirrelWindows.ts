import { WinPackager } from "../winPackager"
import { getArchSuffix, TargetEx } from "../platformPackager"
import { Arch } from "../metadata"
import * as path from "path"
import { warn, log } from "../util/log"
import { getRepositoryInfo } from "../repositoryInfo"
import { getBinFromBintray } from "../util/binDownload"
import { buildInstaller, convertVersion, SquirrelOptions } from "./squirrelPack"
import { SquirrelWindowsOptions } from "../options/winOptions"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

const SW_VERSION = "1.4.4"
//noinspection SpellCheckingInspection
const SW_SHA2 = "98e1d81c80d7afc1bcfb37f3b224dc4f761088506b9c28ccd72d1cf8752853ba"

export default class SquirrelWindowsTarget extends TargetEx {
  private readonly options: SquirrelWindowsOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.devMetadata.build.squirrelWindows)

  constructor(private packager: WinPackager) {
    super("squirrel")
  }

  async build(appOutDir: string, arch: Arch) {
    if (arch === Arch.ia32) {
      warn("For windows consider only distributing 64-bit, see https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130")
    }

    const appInfo = this.packager.appInfo
    const version = appInfo.version
    const archSuffix = getArchSuffix(arch)
    const setupFileName = `${appInfo.productFilename} Setup ${version}${archSuffix}.exe`

    const installerOutDir = path.join(appOutDir, "..", `win${getArchSuffix(arch)}`)

    const distOptions = await this.computeEffectiveDistOptions()

    await buildInstaller(<SquirrelOptions>distOptions, installerOutDir, setupFileName, this.packager, appOutDir)

    this.packager.dispatchArtifactCreated(path.join(installerOutDir, setupFileName), `${appInfo.name}-Setup-${version}${archSuffix}.exe`)

    const packagePrefix = `${appInfo.name}-${convertVersion(version)}-`
    this.packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}full.nupkg`))
    if (distOptions.remoteReleases != null) {
      this.packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}delta.nupkg`))
    }

    this.packager.dispatchArtifactCreated(path.join(installerOutDir, "RELEASES"))
  }

  async computeEffectiveDistOptions(): Promise<SquirrelOptions> {
    const packager = this.packager
    let iconUrl = this.options.iconUrl || packager.devMetadata.build.iconUrl
    if (iconUrl == null) {
      const info = await getRepositoryInfo(packager.appInfo.metadata, packager.devMetadata)
      if (info != null) {
        iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.relativeBuildResourcesDirname}/icon.ico?raw=true`
      }

      if (iconUrl == null) {
        throw new Error("iconUrl is not specified, please see https://github.com/electron-userland/electron-builder/wiki/Options#WinBuildOptions-iconUrl")
      }
    }

    checkConflictingOptions(this.options)

    const appInfo = packager.appInfo
    const projectUrl = await appInfo.computePackageUrl()
    const options: any = Object.assign({
      name: appInfo.name,
      productName: appInfo.productName,
      appId: this.options.useAppIdAsId ? appInfo.id : appInfo.name,
      version: appInfo.version,
      description: appInfo.description,
      authors: appInfo.companyName,
      iconUrl: iconUrl,
      extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
      copyright: appInfo.copyright,
      packageCompressionLevel: packager.devMetadata.build.compression === "store" ? 0 : 9,
      vendorPath: await getBinFromBintray("Squirrel.Windows", SW_VERSION, SW_SHA2)
    }, this.options)

    if (options.remoteToken == null) {
      options.remoteToken = process.env.GH_TOKEN
    }

    if (!("loadingGif" in options)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("install-spinner.gif")) {
        options.loadingGif = path.join(packager.buildResourcesDir, "install-spinner.gif")
      }
    }

    if (options.remoteReleases === true) {
      const info = await getRepositoryInfo(packager.appInfo.metadata, packager.devMetadata)
      if (info == null) {
        warn("remoteReleases set to true, but cannot get repository info")
      }
      else {
        options.remoteReleases = `https://github.com/${info.user}/${info.project}`
        log(`remoteReleases is set to ${options.remoteReleases}`)
      }
    }

    return options
  }
}

function checkConflictingOptions(options: any) {
  for (let name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
    if (name in options) {
      throw new Error(`Option ${name} is ignored, do not specify it.`)
    }
  }

  if ("noMsi" in options) {
    warn(`noMsi is deprecated, please specify as "msi": true if you want to create an MSI installer`)
    options.msi = !options.noMsi
  }

  const msi = options.msi
  if (msi != null && typeof msi !== "boolean") {
    throw new Error(`msi expected to be boolean value, but string '"${msi}"' was specified`)
  }
}