function space(x) {
    var res = '';
    while(x--) res += ' ';
    return res;
}

function listRoutes(){
    for (var i = 0; i < arguments.length;  i++) {
        if (arguments[i].stack instanceof Array){
            console.log('');
            arguments[i].stack.forEach((a) => {
                var route = a.route;
                if (route){
                    route.stack.forEach((r) => {
                        var method = r.method.toUpperCase();
                        console.log(method,space(8 - method.length),route.path);
                    })
                }
            });
        }
    }
}

module.exports = listRoutes;