var devices = {};
var nodes = new vis.DataSet();
var edges = new vis.DataSet();
edges.on('*', function (event, properties, senderId) {
      console.log('event', event, properties);
});
var topology_physics = true;

$( document ).ready(api_load_devices);
$( '#topology_save' ).click(api_save_topology);
$( '#topology_toggle' ).click(topology_toggle);
$( '#topology_delete_edge' ).click(topology_delete_edge);


function api_load(url, callback){
    var result = false;
    $.ajax({
        url: url,
        dataType: 'json',
        success: callback,
    });
    return result;
}

function api_load_devices(){
    $.ajax({
        url: "/api/dcim/devices/?limit=0&site="+SITE_SLUG,
        dataType: 'json',
        success: function(response, status) {
           $.each(response.results, function(index, device) {
               devices[device.id] = device;
               var node = {
                   id: device.id, 
                   label: '*'+device.name+'*\n'+device.device_type.model, 
                   image: TOPOLOGY_IMG_DIR + device.device_role.slug+'.png',
                   title: device.device_role.name+'<br>'+device.name+'<br>'+device.device_type.manufacturer.name+' '+device.device_type.model+'<br>SN: '+device.serial,
               }
               if (device.coordinates){
                   console.log('coords: '+ device.coordinates);
                   var coord = device.coordinates.split(";");
                   node.x = coord[0];
                   node.y = coord[1];
                   node.physics = false;
                   topology_physics = false;
                   console.log('set phys to false');
               }
               nodes.add(node);
           });
           api_load_connections();
        },
    });
}

function api_load_connections(){
    $.ajax({
        url: "/api/dcim/interface-connections/?limit=0&site="+SITE_SLUG,
        dataType: 'json',
        success: function(response, status) {
           $.each(response.results, function(index, connection) {
               //console.log(connection.id);
               edges.add({
                   id: connection.id,
                   from: connection.interface_a.device.id, 
                   to: connection.interface_b.device.id, 
                   title: connection.interface_a.device.name+' ['+connection.interface_a.name+']<br>'+connection.interface_b.device.name+' ['+connection.interface_b.name+']',
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
        nodes: {
            shape: 'image',
            brokenImage: TOPOLOGY_IMG_DIR + 'broken.png',
            size: 35,
            font: { multi: 'md' }, 
        },
        edges: {
            length: 100, 
            width: 2,
        },
        physics: {
            solver: 'forceAtlas2Based', //best solver fot network diagrams
        },
        interaction:{
            hover:true
        },
        manipulation: {
            //enabled: true,
            addEdge: function(edgeData,callback) {
                callback(null);
                if (edgeData.from == edgeData.to){
                    alert('Click on a device and drag the edge to another device to connect them');
                    return;
                }
                topology.disableEditMode();
                api_load('/api/dcim/interfaces/?limit=0&device_id='+edgeData.from, function(response, status){
                    $('#device_A_interfaces').html('');
                    $.each(response.results, function(index, interface){
                        if (interface.device.id != edgeData.from) {
                            console.log(interface.name+' belongs to other device: '+interface.device.id +' != '+ edgeData.from);
                            return;
                        }
                        $('#device_A_interfaces').append($('<option>', {
                            value: interface.id,
                            text: interface.name + (interface.interface_connection ? ' ['+interface.interface_connection.interface.device.name+']' : ''),
                            disabled: interface.interface_connection ? true : false,
                        }))
                    });
                    $('#device_A').text(devices[edgeData.from].name);
                });
                api_load('/api/dcim/interfaces/?limit=0&device_id='+edgeData.to, function(response, status){
                    $('#device_B_interfaces').html('');
                    $.each(response.results, function(index, interface){
                        if (interface.device.id != edgeData.to) {
                            console.log(interface.name+' belongs to other device: '+interface.device.id +' != '+ edgeData.to);
                            return;
                        }
                        $('#device_B_interfaces').append($('<option>', {
                            value: interface.id,
                            text: interface.name + (interface.interface_connection ? ' ['+interface.interface_connection.interface.device.name+']' : ''),
                            disabled: interface.interface_connection ? true : false,
                        }))
                    });
                    $('#device_B').text(devices[edgeData.to].name);
                });
		$( "#add_interface_dialog" ).dialog({
                    close: function( event, ui ) {
                        $( '#add_interface_confirm' ).off('click');
                        $( '#topology_add_edge_label' ).text('Add connection');
                    },
                });
                $( '#add_interface_confirm' ).on('click', function(){topology_add_interface(edgeData)});
            },
        },
    };
    $( '#topology_toggle_label' ).text(topology_physics ? 'Dynamic' : 'Static');
    topology = new vis.Network(container, data, options);
    $( '#topology_add_edge' ).click(function(){
        $( '#topology_add_edge' ).toggleClass('addMode');
        if ($( '#topology_add_edge' ).hasClass('addMode')) {
            $( '#topology_add_edge_label' ).text('Cancel');
            topology.addEdgeMode();
        }else{
            $( '#topology_add_edge_label' ).text('Add connection');
            topology.disableEditMode();
        }
    });
}

function topology_add_interface(edgeData) {
    var interface_a = $('#device_A_interfaces').val();
    var interface_b = $('#device_B_interfaces').val();
    $.ajax({
        url: "/api/dcim/interface-connections/",
        headers: {"X-CSRFToken": $( "input[name=csrfmiddlewaretoken]" ).val()},
        method: "POST",
        data: {
            interface_a: interface_a,
            interface_b: interface_b,
        },
        success: function(response, status) {
            // only draw edge if API call was successful
            edgeData.id = response.id;
            edges.add(edgeData);
        },
    });
    $( "#add_interface_dialog" ).dialog( "close" );
}

function topology_delete_edge() {
    if (topology.getSelectedEdges().length > 1){
        // Do not remove multiple interfaces at the same time
        return false;
    }
    api_load('/api/dcim/interface-connections/'+topology.getSelectedEdges()[0]+'/', function(response, status){
        console.log(response);
        $('#delete_device_A').text(response.interface_a.device.name+' - '+response.interface_a.name );
        $('#delete_device_B').text(response.interface_b.device.name+' - '+response.interface_b.name );
        $( '#delete_interface_confirm' ).off('click');
        $( '#delete_interface_confirm' ).on('click', function(){topology_delete_edge_confirmed(topology.getSelectedEdges()[0])});
        $( "#delete_interface_dialog" ).dialog({
        });
    });
}

function topology_delete_edge_confirmed(edgeId) {

    $.ajax({
        url: "/api/dcim/interface-connections/"+edgeId+'/',
        headers: {"X-CSRFToken": $( "input[name=csrfmiddlewaretoken]" ).val()},
        method: "DELETE",
        success: function(response, status) {
            // only remove edge if API DELETE was successful
            edges.remove(edgeId);    
        },
    });
    $( "#delete_interface_dialog" ).dialog( "close" );
}

function api_save_topology() {
    var nodes = topology.getPositions();
    $.each(nodes, function(device_id, coordinates) {
        $.ajax({
            url: "/api/dcim/devices/"+device_id+'/',
            headers: {"X-CSRFToken": $( "input[name=csrfmiddlewaretoken]" ).val()},
            method: "PATCH",
            data: {coordinates: topology_physics ? '': coordinates.x+';'+coordinates.y},
        });
    });
}

function topology_toggle() {
    topology_physics = !topology_physics;
    nodes.forEach(function(node){
        node.physics = topology_physics;
        if (topology_physics) {
            node.x = undefined;
            node.y = undefined;
        }
        nodes.update(node);
    })
    $( '#topology_toggle_label' ).text(topology_physics ? 'Dynamic' : 'Static');
}
