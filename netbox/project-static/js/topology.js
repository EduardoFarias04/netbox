var nodes = [];
var edges = [];

$( document ).ready(api_load_devices);
$( '#topology_save' ).click(api_save_coordinates);

function api_load_devices(){
    $.ajax({
        url: "/api/dcim/devices/?site="+SITE_SLUG,
        dataType: 'json',
        success: function(response, status) {
           $.each(response.results, function(index, device) {
               var node = {
                   id: device.id, 
                   label: '*'+device.name+'*\n'+device.device_type.model, 
                   shape: 'image', 
                   image: TOPOLOGY_IMG_DIR + device.device_role.slug+'.png', 
                   brokenImage: TOPOLOGY_IMG_DIR + 'broken.png',
                   font: { multi: 'md' }, 
               }
               if (device.coordinates){
                   var coord = device.coordinates.split(";");
                   node.x = coord[0];
                   node.y = coord[1];
                   node.physics = false;
               }
               nodes.push(node);
           });
           api_load_connections();
        },
    });
}

function api_load_connections(){
    $.ajax({
        url: "/api/dcim/interface-connections/?site="+SITE_SLUG,
        dataType: 'json',
        success: function(response, status) {
           $.each(response.results, function(index, connection) {
               //console.log(connection.id);
               edges.push({
                   from: connection.interface_a.device.id, 
                   to: connection.interface_b.device.id, 
                   length: 100, 
                   width: 2,
               });
           });
           visjs_draw_topology()
        },
    });
}

function visjs_draw_topology() {
    // create a network
    var container = document.getElementById('visjsgraph');
    var data = {
        nodes: nodes,
        edges: edges
    };
    var options = {
        height: '600px',
        physics: {
            solver: 'forceAtlas2Based', //best solver fot network diagrams
        },
    };
    topology = new vis.Network(container, data, options);
}

function api_save_coordinates() {
    var nodes = topology.getPositions();
    $.each(nodes, function(device_id, coordinates) {
        $.ajax({
            url: "/api/dcim/devices/"+device_id+'/',
            headers: {"X-CSRFToken": $( "input[name=csrfmiddlewaretoken]" ).val()},
            method: "PATCH",
            data: {coordinates: coordinates.x+';'+coordinates.y},
        });
    });
}
