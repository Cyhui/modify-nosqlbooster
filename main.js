const os = require("os");
const path = require("path");
const fs = require('fs-extra');
const acorn = require("acorn");
const escodegen = require("escodegen");
const estraverse = require("estraverse");
const chalk = require('chalk');
const asar = require('@electron/asar');

async function main() {
    console.log(chalk.greenBright('🎊 欢迎使用 nosqlbooster 修改脚本 🎊'));
    console.log(chalk.greenBright("💻 当前操作系统:"), chalk.blueBright(os.platform()));
    let resourcePath = '';
    if (os.platform() === 'win32') {
        resourcePath = path.join(os.homedir(), './AppData/Local/Programs/nosqlbooster4mongo/resources');
    } else if (os.platform() === 'darwin') {
        resourcePath = '/Applications/NoSQLBooster for MongoDB.app/Contents/Resources';
    } else if (os.platform() === 'linux') {
        try {
            let cmd = `find / -name nosqlbooster4mongo -type f`;
            let t = require('child_process').execSync(cmd);
            if (t) resourcePath = path.dirname(t.toString().trim()) + '/resources';
        } catch (e) {}
    }
    if (!resourcePath) return Promise.reject("不支持当前操作系统");
    console.log(chalk.greenBright("📄 app.asar 文件位置:"), chalk.blueBright(resourcePath));
     
    let appAsarPath = path.join(resourcePath, "./app.asar");
    let appAsarStat = fs.statSync(appAsarPath);
    if (!appAsarStat.isFile()) return Promise.reject("未找到app.asar文件");

    // 清理之前解压出来的文件夹
    let appDirPath = path.join(__dirname, "./app");
    let tmpAppAsarPath = path.join(__dirname, "./app.asar");
    await fs.remove(appDirPath);
    await fs.remove(tmpAppAsarPath);
    
    // 解压
    console.log(chalk.greenBright("📌 app.asar 文件解压开始"));
    asar.extractAll(appAsarPath, appDirPath);
    console.log(chalk.greenBright("✅ app.asar 文件解压结束"));

    // 替换代码段
    console.log(chalk.greenBright("📌 修改文件开始"));
    modifyLicenseFile(appDirPath);
    cancelAutoUpdate(appDirPath);
    modifyMbExporter(appDirPath);
    modifyMongoDumpTask(appDirPath);
    console.log(chalk.greenBright("✅ 修改文件结束"));

    console.log(chalk.greenBright("📌 app.asar 文件生成开始"));
    await asar.createPackage(appDirPath, tmpAppAsarPath);
    await fs.copy(tmpAppAsarPath, appAsarPath);
    console.log(chalk.greenBright("✅ app.asar 文件生成结束"));

    // 清理之前解压出来的文件夹
    await fs.remove(appDirPath);
    await fs.remove(tmpAppAsarPath);
}

function modifyLicenseFile(rootPath) {
    let imCoreFile = path.join(rootPath, "./shared/lmCore.js");
    let str = fs.readFileSync(imCoreFile).toString();
    let ast = acorn.parse(str, { ecmaVersion: 2020 });

    estraverse.traverse(ast, {
        leave(node) {
            if (
                node.type === "VariableDeclarator" &&
                node.id.type === "Identifier" &&
                ["MAX_TRIAL_DAYS", "TRIAL_DAYS"].includes(node.id.name)
            ) {
                // 修改 MAX_TRIAL_DAYS, TRIAL_DAYS
                node.init.value = 10000;
                node.init.raw = "10000";
            } else if (
                node.type === "Property" &&
                node.kind === "init" &&
                ["isPersonalLic", "isCommercialLic", "licensed"].includes(node.key.name)
            ) {
                node.value = { type: "Literal", value: true, raw: "true" };
            }
        },
    });

    let nStr = escodegen.generate(ast, {
        format: { semicolons: false, space: "" },
    });
    fs.writeFileSync(imCoreFile, nStr);
}

function cancelAutoUpdate(rootPath) {
    let appReadyHandleFile = path.join(rootPath, "./backend/appReadyHandle.js");
    let str = fs.readFileSync(appReadyHandleFile).toString();
    let ast = acorn.parse(str, { ecmaVersion: 2020 });
    estraverse.replace(ast, {
        leave(node, parent) {
            if (
                node.type === "ExpressionStatement" &&
                node.expression.type == "NewExpression" &&
                node.expression.callee.object.name === "autoUpdater_1"
            ) {
                this.remove();
            }
        },
    });
    let nStr = escodegen.generate(ast, {
        format: { semicolons: false, space: "" },
    });
    fs.writeFileSync(appReadyHandleFile, nStr);
}

function modifyMbExporter(rootPath) {
    let mbExporterFile = path.join(rootPath, "./backend/mbExporter.js");
    let str = fs.readFileSync(mbExporterFile).toString();
    let ast = acorn.parse(str, { ecmaVersion: 2020 });

    estraverse.replace(ast, {
        leave(node, parent) {
            if (
                node.type === "ThrowStatement" &&
                node.argument.type === "NewExpression" &&
                node.argument.callee &&
                node.argument.callee.object &&
                node.argument.callee.object.name === "shared_1" &&
                node.argument.callee.property.name === "MbError"
            ) {
                this.remove();
            }
        },
    });
    let nStr = escodegen.generate(ast, {
        format: { semicolons: false, space: "" },
    });
    fs.writeFileSync(mbExporterFile, nStr);
}

function modifyMongoDumpTask(rootPath) {
    let mongoDumpTaskFile = path.join(
        rootPath,
        "./shared/importExport/MongoDumpTask.js"
    );
    let str = fs.readFileSync(mongoDumpTaskFile).toString();
    let ast = acorn.parse(str, { ecmaVersion: 2020 });

    estraverse.traverse(ast, {
        leave(node) {
            if (
                node.type === "IfStatement" &&
                node.test.operator === ">" &&
                node.test.right.value === 1 &&
                node.test.left.property.name === "length" &&
                node.test.left.object.object &&
                node.test.left.object.object.name === "n" &&
                node.test.left.object.property &&
                node.test.left.object.property.name === "dumpCollections"
            ) {
                let str2 =
                    "return n.dumpCollections.map((e) => {\
                    return `-d ${(0, index_1.tojson)(i)} -c ${(0, index_1.tojson)(e)}`;\
                });";
                let ast2 = acorn.parse(str2, { allowReturnOutsideFunction: true, ecmaVersion: 2020 });
                node.consequent.body = ast2.body;
            }
        },
    });
    let nStr = escodegen.generate(ast, {
        format: { semicolons: false, space: "" },
    });
    fs.writeFileSync(mongoDumpTaskFile, nStr);
}

let hasErr = false;

main()
    .catch((err) => {
        hasErr = true;
        console.log(chalk.red("😨 " + err));
    })
    .finally(() => {
        if (!hasErr) console.log(chalk.greenBright("😁 执行结束, 感谢使用。"))
        process.exit();
    });
