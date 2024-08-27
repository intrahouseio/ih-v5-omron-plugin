/**
 * omron-fins index.js
 */
const util = require('util');
const client = require('./client');


let nextTimer; // таймер поллинга
let waiting;   // Флаг ожидания завершения операции (содержит ts старта операции или 0)
let toWrite = []; // Массив команд на запись
let plugin;
let chanValues = {};
(async () => {


  try {
    const opt = getOptFromArgs();
    const pluginapi = opt && opt.pluginapi ? opt.pluginapi : 'ih-plugin-api';
    plugin = require(pluginapi + '/index.js')();
    plugin.log('Plugin omron fins has started.', 1);

    plugin.params.data = await plugin.params.get();
    plugin.log('Received params data:' + util.inspect(plugin.params.data), 1);

    plugin.channels.data = await plugin.channels.get();
    plugin.log('Received channels data: ' + util.inspect(plugin.channels.data), 1); 

    client.init(plugin);
    client.addItems(plugin.channels.data);
    const res = await client.connect();
    plugin.log("connection " + util.inspect(res), 1);
    client.conn.on('close', function () {
      plugin.exit(8, 'disconnected');
    });
    sendNext();
  } catch (err) {
    let res = [];
    arr.forEach((item) => {
      res.push({ id: item.id, chstatus: 1 });
    });

    plugin.sendData(res);
    plugin.exit(8, util.inspect(err));
  }
})();


/*  sendNext
*   Отправка на контроллер запроса на чтение или запись
* 
*    Для чтения функция запускается по таймеру nextTimer 
*    Если пришла команда на запись - таймер сбрасывается и функция вызывается напрямую
*
*    Если функция вызвана, а предыдущая операция не завершена (возможно при записи )
*     то ожидаем окончания операции (для этого взводим короткий таймер)
*/
async function sendNext() {
  if (waiting) {
    // TODO Если ожидание длится долго - сбросить флаг и выполнить следующую операцию
    nextTimer = setTimeout(sendNext, 1000); // min interval?
    return;
  }

  let nextDelay = plugin.params.data.polldelay; // стандартный интервал опроса
  waiting = Date.now();
  if (toWrite.length) {
    await write();
    nextDelay = 100; // интервал - чтение после записи
  } else {
    await read();
  }
  waiting = 0;
  nextTimer = setTimeout(sendNext, nextDelay);
}

/*  read
*   Отправляет команду чтения на контроллер, ожидает результат
*   Преобразует результат и отправляет данные на сервер {id, value}
*
*   !Библиотека предоставляет только функцию readAllItems
*    "It sorts a large number of items being requested from the PLC and decides 
*     what overall data areas to request, then it groups multiple small requests 
*     together in a single packet or number of packets up to the maximum length the PLC supports, 
*     then it sends multiple packets at once, for maximum speed."
*/
async function read() {

  let arr = [];
  let value;
  let chunk = [];
  let i;
  try {
    arr = Object.keys(client.variables)
    for (i = 0; i < arr.length; i++) {
      let res = [];
      chunk = client.variables[arr[i]];
      const data = await client.readAll(chunk, client.varChan[i]);
      if (data.response.values.length > 0) {
        data.response.values.forEach((item, index) => {
          if (typeof chanValues[client.varChan[i][index].id] !== 'object') chanValues[client.varChan[i][index].id] = {}
          value = item;
          if (plugin.params.data.sendChanges) {
            if (chanValues[client.varChan[i][index].id].value != value) {
              res.push({ id: client.varChan[i][index].id, value: value, chstatus: 0, title: client.varChan[i][index].title });
              chanValues[client.varChan[i][index].id].value = value;
            }
          } else {
            res.push({ id: client.varChan[i][index].id, value: value, chstatus: 0, title: client.varChan[i][index].title });
          }
        });
        if (res.length > 0) plugin.sendData(res);
      }
    }

  } catch (e) {

    plugin.log('Group Read error', 1);

    res = [];
    errres = [];
    for (let j = 0; j < chunk.length; j++) {
      try {
        const data = await client.readAll([chunk[j]]);
        if (data.response.values.length > 0) {
          data.response.values.forEach((item) => {
            res.push({ id: client.varChan[i][j].id, value: item.value, chstatus: 0, title: client.varChan[i][j].title });
          });
        }
      } catch (e) {
        errres.push({ id: client.varChan[i][j].id, chstatus: 1, title: client.varChan[i][j].title });
        client.removeItems(i, j, plugin);  
      }
    }
    if (res.length > 0) plugin.sendData(res);
    if (errres.length > 0) plugin.sendData(errres);
    if (errres.length == plugin.channels.data.length) plugin.exit(2, 'All ' + plugin.channels.data.length + ' tags are unavailable');
    
    //channels = client.addItems(arr);
  }
}
/*  write
*   Отправляет команду записи на контроллер и ожидает завершения 
*   Данные для отправки находятся в массиве toWrite = [{id, value}]
*   (возможно накопление нескольких команд при ожидании окончания предыдущей операции)
*
*  Перед отправкой данные разделяются на массивы items = ['TEST1','TEST2'] и values = [42,1] 
*   так как функция библиотеки writeItems(items, values) принимает 2 массива:
*   "Writes items to the PLC using the corresponding values"
 
*  Массив toWrite очищается
*/
async function write() {
  try {
    for (i = 0; i < toWrite.length; i++) {
      const item = toWrite[i];
      await client.write(item.address, item.value);
    }
    toWrite = [];
    plugin.log('Write completed ', 1);

  } catch (e) {
    plugin.log('Write ERROR: ' + util.inspect(e), 1);
  }
}

function getOptFromArgs() {
  let opt;
  try {
    opt = JSON.parse(process.argv[2]); //
  } catch (e) {
    opt = {};
  }
  return opt;
}


// Сообщения от сервера
/**  act
 * Получили от сервера команду(ы) для устройства - пытаться отправить на контроллер
 *
 * @param {Array of Objects} - message.data - массив команд
 */
plugin.onAct(message => {
  //console.log('Write recieve', message);
  plugin.log('ACT data=' + util.inspect(message.data), 1);

  if (!message.data) return;
  message.data.forEach(item => {
    toWrite.push({ address: item.address, value: item.value });
  });
  // Попытаться отправить на контроллер
  // Сбросить таймер поллинга, чтобы не случилось наложения
  clearTimeout(nextTimer);
  sendNext();
});

plugin.channels.onChange(async function (data) {
  try {
    clearTimeout(nextTimer);
    plugin.channels.data = await plugin.channels.get();
    client.variables = {};
    client.varChan = {};
    client.addItems(plugin.channels.data);
    chanValues = {};
    sendNext();
  } catch (e) {
    plugin.log('ERROR onChange: ' + util.inspect(e), 1);
  }

});

// Завершение работы
function terminate() {
  client.close();
}


process.on('exit', terminate);
process.on('SIGTERM', () => {
  process.exit(0);
});
