'use strict'

const {
    reject,
    isValidPublicKey,
    isPublicKeyUsed,
    checkStateAddresses,
    isPresent,
    getActionField,
} = require('./services/utils')
const {
    make_proposal_address,
    make_agent_address,
    make_record_address,
    make_record_type_address,
    make_property_address_range,
    make_property_address,
    hashAndSlice,
    FULL_PREFIXES,
    TYPE_PREFIXES,
} = require('./services/addressing')

const {
    Agent,
    AgentContainer,
    Record,
    RecordContainer,
    Property,
    RecordTypeContainer,
    PropertyContainer,
    PropertyPage,
    PropertyValue,
    PropertyPageContainer,
    Proposal,
    ProposalContainer,
    PropertySchema,
    RecordType,
} = require('./services/proto')

const {TransactionHandler} = require('sawtooth-sdk/processor/handler')
const {TpProcessRequest} = require('sawtooth-sdk/protobuf')
const {FAMILY_NAME, NAMESPACE, VERSION} = require('./services/addressing')
const {
    SCPayload,
    SCPayloadActions,
    SCPayloadFields
} = require('./services/proto')


/**
 * Extension of TransactionHandler class in order to implement the SawChain Transaction Processor logic.
 */
class ChequesHandler extends TransactionHandler {
    /**
     * TransactionHandler constructor registers itself with the validator, declaring which family name, versions, and
     * namespaces it expects to handle.
     */
    constructor() {
        super(FAMILY_NAME, [VERSION], [NAMESPACE])
    }

    /**
     * Evaluate and execute every transaction updating the state according to the action.
     * @param {TpProcessRequest} txn Transaction that is requested to be process.
     * @param {Context} context Object used to write/read in Sawtooth ledger state.
     */
    async apply(txn, context) {
        // Retrieve SawChain payload object from txn.
        const payload = SCPayload.decode(txn.payload)
        const action = payload.action
        const signerPublicKey = txn.header.signerPublicKey
        const timestamp = payload.timestamp

        // Validation: Payload timestamp is not set.
        if (!timestamp.low && !timestamp.high)
            reject(`Payload timestamp is not set.`)

        // Action handling.
        switch (action) {
            case 0:

                console.log("payload.createAgent.CreateAgentAction.name")
                console.log(payload.createAgent)
                console.log(payload.createAgent["name"])
                console.log(payload.createAgent.name)

                await crearUsuario(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.createAgent
                )
                break

            case 1:
                console.log(payload)
                await crearCheque(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.createRecord
                )
                break

            case 2:
                console.log(payload)
                await finalizeRecord(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.finalizeRecord
                )
                break

            case 3:
                console.log(payload.createRecordType)

                await createRecordType(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.createRecordType
                )
                break

            case 4:
                console.log(payload)
                await actualizarCampo(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.updateProperties
                )
                break

            case 5:
                console.log(payload)
                await createProposal(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.createProposal
                )
                break

            case 6:
                console.log(payload)
                await answerProposal(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.answerProposal
                )
                break

            case 7:
                console.log(payload)
                await revokeReporter(
                    context,
                    signerPublicKey,
                    timestamp,
                    payload.revokeReporter
                )
                break

            default:

                reject(`Unknown action: ${action}`)
        }
    }


}


/**
 * Agregar un nuevo usuario al Blockchain
 * @entrada {String} Llave publica del usuario a registrar
 * @entrada {Object} timestamp Fecha del momento en que es enviada la transaccion
 * @param {String} name Nombre del usuario a registrar.
 * @param {String} cedula Identificacion unica del usuario
 */
async function crearUsuario(context, signerPublicKey, timestamp, {name}) {


    if (!name) {
        reject('El nombre del usuario no debe estar vacio')
    }
    //SE OBTIENE LA DIRECCION DEL USUARIO EN TERMINOS DEL BLOCKCHAIN
    const address = make_agent_address(signerPublicKey)

    //SE BUSCA LA DIRECCION DEL USUARIO EN EL BLOCKCHAIN
    let state = await context.getState([address])

    //SE DECODIFICA LO QUE LLEGO DEL BLOCKCHAIN
    const agenttemp = await AgentContainer.decode(state[address])


    let t = true
    for (var key in agenttemp.entries) {
        t = false


        //SI LLEGA ALGO DEL BLOCKCHAIN SIGNIFICA QUE YA EXISTE EL USUARIO
        if (key.publicKey === signerPublicKey) {

            reject('Ya existe el usuario')


        }
    }
    if (t) {

        //SE CREA EL NUEVO USUARIO
        let agent2 = Agent.create({
            publicKey: signerPublicKey,
            timestamp: timestamp,
            name: name,
        })


        let t = true
        for (var key in state) {
            t = false


            if (state[key]) {

                let updates = {}
                let t = AgentContainer.decode(state[key])
                t.entries.push(agent2)

                //SE CODIFICA EL NUEVO USUARIO EN TERMINOS DEL BLOCKCHAIN
                let se = await AgentContainer.encode(t).finish()
                updates[address] = se
                //SE CREA EL NUEVO USUARIO EN EL BLOCKCHAIN
                await context.setState(updates)


            }
        }
        if (t) {
            //ENTRA SI NO EXISTE UN CONTENEDOR DE USUARIOS EN EL BLOCKCHAIN


            let newcontainer = AgentContainer.create({
                entries: [],
            })


            newcontainer.entries.push(agent2)

            let updates = {}
            //SE CODIFICA EL NUEVO USUARIO EN TERMINOS DEL BLOCKCHAIN
            let se = await AgentContainer.encode(newcontainer).finish()
            updates[address] = se
            //SE CREA EL NUEVO USUARIO EN EL BLOCKCHAIN
            await context.setState(updates)
        }


        console.log("creado")
    }


}

/**
 * Agregar un nuevo cheque al Blockchain
 * @entrada {String} Llave publica del usuario que es el primer beneficiario del cheque
 * @entrada {Object} timestamp Fecha del momento en que es enviada la transaccion
 */
async function crearCheque(
    context,
    signerPublicKey,
    timestamp,
    {recordId, recordType, properties},
) {

    // SE VALIDA QUE SE INGRESARON TODOS LOS DATOS
    if (!recordId) {
        reject('No se ingreso el id del cheque')
    }


    // SE VALIDA QUE SE INGRESARON TODOS LOS CAMPOS
    if (!properties) {
        reject('No se ingresaron los campos')
    }

    // SE VALIDA QUE EXISTE EL USUARIO
    if (verificarUsuario(context, signerPublicKey)) {


        //SE OBTIENE LA DIRECCION DEL CHEQUE ESPECIFICO EN TERMINOS DEL BLOCKCHAIN
        const address = make_record_address(recordId)

        //SE BUSCA EL CHEQUE EN EL BLOCKCHAIN
        let state = await context.getState([address])

        //SE DECODIFICA LO QUE LLEGO DEL BLOCKCHAIN
        const recordTemp = await RecordContainer.decode(state[address])
        console.log(recordTemp)

        //SE VALIDA QUE NO EXISTA UN CHEQUE CON EL MISMO ID
        if (recordTemp.record_id === recordId) {
            reject('Ya existe un cheque con ese id')
        }

        //SE OBTIENE LA DIRECCION DEL TIPO DE CHEQUE EN TERMINOS DEL BLOCKCHAIN
        const addressType = make_record_type_address(recordType)

        //SE BUSCA EL TIPO DEL CHEQUE EN EL BLOCKCHAIN
        let stateType = await context.getState([addressType])

        //SE DECODIFICA LO QUE LLEGO DEL BLOCKCHAIN
        const typeTemp = await RecordTypeContainer.decode(stateType[addressType])


        console.log("typeTemp.entries")
        let type = null

        //SE VALIDA QUE EXISTA EL TIPO DE CHEQUE
        for (var key in typeTemp.entries) {


            //SE VALIDA QUE EXISTA EL TIPO DE CHEQUE
            if (typeTemp.entries[key].name !== recordType) {

                reject('No existe este tipo de cheque')
            }
            if (typeTemp.entries[key].name === recordType) {
                    type = typeTemp.entries[key]

            }
        }

        console.log("typeTemp")

        //SE GUARDAN LOS CAMPOS QUE SE PUEDEN INGRESAR PARA EL TIPO DE CHEQUE INGRESADO
        var type_schemata = {};
        for (let prop in type.properties) {
            type_schemata[type.properties[prop].name] = type.properties[prop]
        }

        //SE GUARDAN LOS CAMPOS OBLIGATORIOS PARA EL TIPO DE CHEQUE INGRESADO
        var required_properties = {};
        for (let name in type_schemata) {
            if (type_schemata[name].required) {
                required_properties[name] = type_schemata[name]
            }

        }

        //SE GUARDAN LOS CAMPOS INGRESADOS POR EL USUARIO PARA LA CREACION DEL CHEQUE
        var provided_properties = {};
        for (let prop2 in properties) {
            provided_properties[properties[prop2].name] = properties[prop2]


        }

        console.log(type_schemata)
        console.log(required_properties)
        console.log(provided_properties)
        //SE VALIDA QUE SE HAYAN INGRESADO TODOS LOS CAMPOS OBLIGATORIOS
        for (let prop3 in required_properties) {

            if (prop3 in provided_properties) {

            } else {
                reject('No se ingreso un campo obligatorio')
            }

        }


        console.log("SE VALIDA QUE TODOS LOS CAMPOS ESTEN EN EL FORMATO CORRECTO")
        //SE VALIDA QUE TODOS LOS CAMPOS ESTEN EN EL FORMATO CORRECTO
        for (let provided_name in provided_properties) {
            let required_type = type_schemata[provided_name].dataType
            let provided_type = provided_properties[provided_name].dataType

            if (required_type !== provided_type) {

                reject("El valor de uno de los campos esta en un formato icorrecto")
            }

        }


        console.log("SE CREA EL CHEQUE NUEVO")
        //SE CREA EL CHEQUE NUEVO
        let ChequeNuevo = Record.create({
            record_id: recordId,
            record_type: recordType,
            final: false,
            owners: [],
            custodians: []

        })


        ChequeNuevo.owners.push(Record.AssociatedAgent.create({
            agent_id: signerPublicKey,
            timestamp: timestamp,
        }))

        ChequeNuevo.custodians.push(Record.AssociatedAgent.create({
            agent_id: signerPublicKey,
            timestamp: timestamp,
        }))

        //SE OBTIENE LA DIRECCION DEL CHEQUE ESPECIFICO EN TERMINOS DEL BLOCKCHAIN
        const address2 = make_record_address(recordId)

        //SE BUSCA EL CHEQUE EN EL BLOCKCHAIN
        let state2 = await context.getState([address])



        let t = true
        let guardo = false
        let number = 0;
        for (let key in state2) {

            t = false

            if (state2[key] && !guardo) {



                let updates = {}
                let t = RecordContainer.decode(state[key])

                let number =0;
                for(let y in t.entries){

                    if(t.entries[y].record_id === recordId){
                        t.entries.splice(number, 1);

                    }
                    number = number +1
                }

                t.entries.push(ChequeNuevo)


                //SE CODIFICA EL NUEVO CHEQUE EN TERMINOS DEL BLOCKCHAIN
                let se = await RecordContainer.encode(t).finish()
                updates[address] = se

                //SE CREA EL NUEVO CHEQUE EN EL BLOCKCHAIN
                await context.setState(updates)
                guardo = true

                number = number + 1
                console.log("SE CREA EL NUEVO CHEQUE EN EL BLOCKCHAIN")
                let state3 = await context.getState([
                    address2
                ])
                const agenttemp2 = await RecordContainer.decode(state3[address2])



            }
        }

        if (t) {
            console.log("ENTRA SI NO EXISTE UN CONTENEDOR DE CHEQUES EN EL BLOCKCH")
            //ENTRA SI NO EXISTE UN CONTENEDOR DE CHEQUES EN EL BLOCKCHAIN


            let newcontainer = RecordContainer.create({
                entries: [],
            })


            newcontainer.entries.push(ChequeNuevo)


            let updates = {}
            //SE CODIFICA EL NUEVO CHEQUE EN TERMINOS DEL BLOCKCHAIN
            let se = await RecordContainer.encode(newcontainer).finish()
            updates[address] = se
            //SE CREA EL NUEVO CHEQUE EN EL BLOCKCHAIN
            await context.setState(updates)

        }
        console.log(number)

    } else {

        reject('No existe el usuario que quiere crear el cheque')

    }



    for (let name2 in type_schemata) {



        await set_new_property(
            context,
            recordId,
            name2,
            type_schemata[name2].struct_properties,
            type_schemata[name2].enum_options,
            type_schemata[name2].fixed,
            type_schemata[name2].number_exponent,
            type_schemata[name2].unit,
            type_schemata[name2].data_type,
            signerPublicKey
        )

        if (name2 in provided_properties) {
            set_new_propertyPage(context, timestamp, recordId, name2, null, 1)

        } else {

            set_new_propertyPage(context, timestamp, recordId, name2, provided_properties[name2], 1)

        }


    }


}


async function createRecordType(context, signerPublicKey, timestamp, {name, properties}) {
    if (!name) {

        reject('No se ingreso el campo del nombre del cheque')

    }
    if (!properties) {

        reject('No se ingreso ninguna propiedad')
    }

    for (let prop of properties) {

        if (!prop.name) {

            reject('No se ingreso en nombre de la propiedad')
        }

    }

    //SE GUARDAN LOS CAMPOS INGRESADOS POR EL USUARIO PARA LA CREACION DEL TIPO CHEQUE
    var provided_properties = {};
    for (let prop2 in properties) {

        provided_properties[prop2.name] = prop2

    }


    const address = make_record_type_address(name)


    let state = await context.getState([
        address
    ])

    const container = await RecordType.decode(state[address])

    console.log(container)

    //SE CREA EL NUEVO TIPO DE CHEQUE
    let record_type = RecordType.create({
        name: name,
        properties: properties

    })

    for (var key in container.entries) {


        //SI LLEGA ALGO DEL BLOCKCHAIN SIGNIFICA QUE YA EXISTE EL TIPO DE CHEQUE
        if (container.entries[key].name === name) {

            reject('Ya existe este tipo de cheque')
        }
    }

    console.log("entro")
    let t = true
    for (var key in state) {
        t = false
        console.log(state[key])
        // check if the property/key is defined in the object itself, not in parent
        if (state[key]) {

            let updates = {}
            let t = RecordTypeContainer.decode(state[key])
            t.entries.push(record_type)
            console.log(t)
            //SE CODIFICA EL NUEVO TIPO DE CHEQUE EN TERMINOS DEL BLOCKCHAIN
            let se = await RecordTypeContainer.encode(t).finish()
            updates[address] = se
            console.log(updates)
            //SE CREA EL NUEVO TIPO DE CHEQUE EN EL BLOCKCHAIN
            await context.setState(updates)
            let state2 = await context.getState([
                address,
            ])
            const agenttemp2 = await RecordTypeContainer.decode(state2[address])
            const agenttemp3 = await RecordType.decode(state2[address])
            console.log(agenttemp2)
            console.log(agenttemp3)

        }
    }
    if (t) {

        //ENTRA SI NO EXISTE UN CONTENEDOR DE TIPOS DE CHEQUES EN EL BLOCKCHAIN


        let newcontainer = RecordTypeContainer.create({
            entries: [],
        })


        newcontainer.entries.push(record_type)


        let updates = {}
        //SE CODIFICA EL NUEVO TIPO DE CHEQUE EN TERMINOS DEL BLOCKCHAIN
        let se = await RecordTypeContainer.encode(newcontainer).finish()
        updates[address] = se
        //SE CREA EL NUEVO TIPO DE CHEQUE EN EL BLOCKCHAIN
        await context.setState(updates)
    }


    console.log("creado")


}

/**
 * Agregar un nuevo cheque al Blockchain
 * @entrada {String} Llave publica del usuario que realiza la transaccion
 * @entrada {Object} timestamp Fecha del momento en que es enviada la transaccion
 * @entrada {String} record_id Identificador del cheque
 * @entrada {Objeto} properties Campos que van a aser actualizados
 */
async function actualizarCampo(context, signerPublicKey, timestamp, {record_id, properties}) {

    let recordtemp = await getRecord(context, record_id)

    if (recordtemp.record.final === true) {
        //Revisar que el estado del cheque no sea protestado o materializado
        reject('El cheque ya esta en estado protestado o materializado ')
    }

    let updateProp;
    for (updateProp of properties) {


        let nameProp = updateProp.name


        let data_typeProp = updateProp.data_type
        let property_address = make_property_address(record_id, nameProp)
        let prop = await getContainer(context, property_address, "PROPERTY")

        let propAct = null
        let prop2;
        let tipo = nameProp
        for (prop2 of prop.entries) {

            if (prop2.name !== nameProp) {
                reject('la propiedad no existe')
            } else {


            }
            propAct = prop2

        }

        let reporteact = null;
        let reporter;
        for (reporter of prop.reporters) {

            if (reporter.public_key === signerPublicKey && reporter.authorized) {
                reporteact = reporter
            } else {
                reject('El usuario no esta autorizado')
            }

        }

        if (data_typeProp !== propAct.data_type) {
            reject('El tipo de datos de la actualizacion es incorrecto')

        }

        let page_number = propAct.current_page
        let page_address = make_property_address(record_id, nameProp, page_number)
        let page_container = getContainer(context, page_address, "PROPERTY")


        let pageact = null;
        let page;
        for (page of page_container.entries) {

            if (page.name !== nameProp) {
                reject('El usuario no esta autorizado')
            } else {

                pageact = page
            }

        }

        let reported_value = make_new_reported_value(reporteact, timestamp, updateProp)

        if (nameProp === "estado") {

            let ultimoEstado = pageact.reported_values[0]
            if (ultimoEstado.string_value === "ENDOSO" && updateProp.string_value === "ACTIVO") {
                reject('no se puede pasar del estado de ENDOSO a ATIVO')
            }
            if (ultimoEstado.string_value === "CANJE" &&
                (updateProp.string_value !== "PAGADO" || updateProp.string_value !== "PROTESTADO")) {
                reject('no se puede pasar del estado de ENDOSO a ATIVO')
            }


        }

        pageact.reported_values.push([reported_value])

        await setContainer(context, page_address, page_container, "PROPERTY")


    }


}

async function finalizeRecord(context, signerPublicKey, timestamp, {record_id}) {
    let recordtemp = await getRecord(context, record_id)

    if (isOwner(record_id, signerPublicKey || isCustodian(record_id, signerPublicKey))) {
        reject('El susuario no tiene los permisos para eealizar la accion')
    }

    if (recordtemp.record.final === true) {

        reject('El cheque ya esta en estado protestado o materializado ')
    }

    recordtemp.record.final = true

    await setContainer(context, recordtemp.address, recordtemp.container, "RECORD")

}

/**
 * Verififca si un usario existe en el blockchain
 */
async function verificarUsuario(context, publicKey) {
    //SE OBTIENE LA DIRECCION DEL USUARIO EN TERMINOS DEL BLOCKCHAIN
    const address = make_agent_address(publicKey)

    //SE BUSCA LA DIRECCION DEL USUARIO EN EL BLOCKCHAIN
    let state = await context.getState([address,])

    //SE DECODIFICA LO QUE LLEGO DEL BLOCKCHAIN
    const agenttemp = await AgentContainer.decode(state[address])


    //SI LLEGA ALGO DEL BLOCKCHAIN SIGNIFICA QUE YA EXISTE EL USUARIO
    if (agenttemp.publicKey === publicKey) {
        return true
    }
    return false

}

async function createProposal(context, signerPublicKey, timestamp, {record_id, receiving_agent, role, properties}) {


    if(!verificarUsuario(context, signerPublicKey)){
        reject('No existe el usuario')
    }
    if(!verificarUsuario(context, receiving_agent)){
        reject('No existe el usuario al que se va transferir el cheque')
    }
    if(role === 2){

    }
    if(role === 3){

    }




}


async function answerProposal(context, signerPublicKey, timestamp, {record_id, receiving_agent, role, response}) {

    let proposal_address = make_proposal_address(
        record_id, receiving_agent)
    let proposal_container = getContainer(context, proposal_address, "PROPOSAL")


    let proposal = null

    try {
        for (var proposal1 of proposal_container.entries) {

            if (proposal1.status === Proposal.OPEN
                && proposal1.receiving_agent === receiving_agent
                && proposal1.role === role) {

                proposal = proposal1
            }

        }
    } catch (e) {
        reject('No existe el proposal')
    }

    if (response === AnswerProposalAction.CANCEL) {
        if (proposal.issuing_agent !== signerPublicKey) {
            reject('Only the issuing agent can cancel')
        }

        proposal.status = Proposal.CANCELED
    } else if (response === AnswerProposalAction.REJECT) {
        if (proposal.receiving_agent !== signerPublicKey) {
            reject('Only the receiving agent can reject')
        }
        proposal.status = Proposal.REJECTED
    } else if (response === AnswerProposalAction.ACCEPT) {
        if (proposal.receiving_agent !== signerPublicKey) {
            reject('Only the receiving agent can accept')
        }
        proposal.status = await accept_proposal(context, signerPublicKey, timestamp, proposal)

    }

    await setContainer(context, proposal_address, proposal_container, "PROPOSAL")


}

async function accept_proposal(context, signerPublicKey, timestamp, proposal) {

    let record = await getRecord(context, proposal.record_id)

    if (proposal.role === Proposal.OWNER) {

        if (isOwner(record.record, proposal.issuing_agent)) {

            record.record.owners.push([
                Record.AssociatedAgent.create({
                    agent_id: receiving_agent,
                    timestamp: timestamp

                })
            ])

        } else {
            return Proposal.CANCELED
        }

        await setContainer(context, record.address, record.container, "RECORD")

        let recordtype = await get_record_type(context, record.record.record_type)

        for (var prop of recordtype.record_type.properties) {

            let proptemp = await get_property(context, proposal.record_id, prop.name)

            let old_owner = null

            for (var reporter of prop.reporters) {

                if (reporter.public_key === proposal.issuing_agent) {

                    old_owner = reporter
                }

            }

            old_owner.authorized = false

            let new_owner = null
            try {

                for (var reporter of prop.reporters) {

                    if (reporter.public_key === proposal.receiving_agent) {

                        new_owner = reporter
                    }

                }

                if (!new_owner.authorized) {
                    new_owner.authorized = true

                    await setContainer(context, proptemp.address, proptemp.container, "PROPERTY")

                }


            } catch (e) {


                new_owner = Property.Reporter.create({
                    public_key: receiving_agent,
                    authorized: true,
                    index: proptemp.prop.reporters.length,

                })

                proptemp.prop.reporters.push([new_owner])
                await setContainer(context, proptemp.address, proptemp.container, "PROPERTY")

            }


        }

        return Proposal.ACCEPTED
    } else if (proposal.role === Proposal.CUSTODIAN) {


        return Proposal.ACCEPTED
    } else if (proposal.role === Proposal.REPORTER) {


        return Proposal.ACCEPTED
    }


}


async function revokeReporter(context, signerPublicKey, timestamp, {record_id, reporter_id, properties}) {
    let record = await getRecord(context, record_id)
    if (isOwner(record_id, signerPublicKey)) {
        return
    }

    if (record.record.final === true) {

        reject('El cheque ya esta en estado protestado o materializado ')
    }


    let property;
    for (property of properties) {

        let tempProperty = await get_property(context, record_id, property)
        let reporter = null
        for (let reporterItem of tempProperty.prop.reporters) {

            if (reporterItem.public_key !== reporter_id) {
                reject('Ya se le quito los permisos a este usuario')
            } else {
                reporter = reporterItem
            }


        }

        reporter.authorized = false
        await setContainer(context, tempProperty.address, tempProperty.container, "PROPERTY")


    }


}

async function verifyAgent(context, publicKey) {
    let address = make_agent_address(publicKey)
    let container = await getContainer(context, address, "AGENT")

    for (agents of container.entries) {

        if (agents.public_key !== publicKey) {
            reject('No esta registrado el usuario')
        }

    }


}

async function isOwner(record, agent_id) {
    return record.owners[record.owners.length - 1].agent_id == agent_id
}

async function isCustodian(record, agent_id) {
    return record.custodians[record.custodians.length - 1].agent_id == agent_id
}

async function getRecord(context, record_id) {
    let recordAddress = make_record_address(record_id)
    let record_container = await getContainer(context, recordAddress, "RECORD")

    let record2 = null
    for (let recordItem of record_container.entries) {

        if (recordItem.record_id !== record_id) {
            reject('No existe el cheque')
        } else {
            record2 = recordItem
        }

    }
    var obj = {
        record: record2,
        container: record_container,
        address: recordAddress
    }

    return obj
}

async function get_record_type(context, type_name) {
    const type_address = make_record_type_address(type_name)

    let type_container = await getContainer(context, type_address, "RECORD_TYPE")


    let type2 = null
    let typeItem;
    for (typeItem of type_container.entries) {

        if (typeItem.name !== type_name) {
            reject('No se ha creado el modelo del cheque')
        } else {
            type2 = typeItem
        }

    }
    var obj = {
        record_type: type2,
        container: type_container,
        address: type_address
    }

    return obj
}


async function get_property(context, record_id, property_name) {
    const propertyAddress = make_property_address(record_id, property_name, 0)

    let property_container = await getContainer(context, propertyAddress, "PROPERTY")

    let prop2 = null
    for (let propItem of property_container.entries) {

        if (propItem.name !== property_name) {
            reject('La propiedad no existe')
        } else {
            prop2 = propItem
        }

    }
    var obj = {
        prop: prop2,
        container: property_container,
        address: propertyAddress
    }

    return obj
}


async function set_new_property(context, record_id, property_name, struct_properties, enum_options, fixed, number_exponent, unit, data_type, publickey) {
    const address = make_property_address(record_id, property_name, 0)
    let state = await context.getState([address])
    const property_container = await PropertyContainer.decode(state[address])


    let newProperty = Property.create({
        signer: publickey,
        record_id: record_id,
        data_type: data_type,
        current_page: 1,
        wrapped: false,
        reporters: [],
        fixed: fixed,
        number_exponent: number_exponent,
        unit: unit,
        enum_options: enum_options,
        struct_properties: struct_properties
    })

    newProperty.reporters.push(Property.Reporter.create({
            public_key: publickey,
            authorized: true,
            index: 0
        }
    ))


    let t = true
    for (var key in state) {
        t = false


        if (state[key]) {

            let updates = {}
            let t = PropertyContainer.decode(state[key])


            let number =0;
            for(let y in t.entries){

                if(t.entries[y].name === property_name){
                    t.entries.splice(number, 1);

                }
                number = number + 1
            }

            t.entries.push(newProperty)

            //SE CODIFICA EL NUEVO USUARIO EN TERMINOS DEL BLOCKCHAIN
            let se = await PropertyContainer.encode(t).finish()
            updates[address] = se
            //SE CREA EL NUEVO USUARIO EN EL BLOCKCHAIN
            await context.setState(updates)


        }
    }
    if (t) {
        //ENTRA SI NO EXISTE UN CONTENEDOR DE USUARIOS EN EL BLOCKCHAIN


        let newcontainer = PropertyContainer.create({
            entries: [],
        })


        newcontainer.entries.push(newProperty)

        let updates = {}
        //SE CODIFICA EL NUEVO USUARIO EN TERMINOS DEL BLOCKCHAIN
        let se = await PropertyContainer.encode(newcontainer).finish()
        updates[address] = se
        //SE CREA EL NUEVO USUARIO EN EL BLOCKCHAIN
        await context.setState(updates)
    }



}


async function set_new_propertyPage(context, timestamp, record_id, property_name, value, page_number) {
    const address = make_property_address(record_id, property_name, page_number)
    let state = await context.getState([address])
    const property_container = await Property.decode(state[address])

    let page = PropertyPage.create({
        name: property_name,
        record_id: record_id,
        reported_values: []
    })
    let reported = make_new_reported_value(0,timestamp,value)


    if (value !== null) {

        page.reported_values.push(reported)
    }




    let t = true
    for (var key in state) {
        t = false


        if (state[key]) {

            let updates = {}
            let p = PropertyPageContainer.decode(state[key])
            let t = p.entries

            let number = 0;
            for(let y in t){

                if(t[y].name === property_name){
                    p.entries.splice(number, 1);

                }
                number = number + 1
            }
            p.entries.push(page)

            //SE CODIFICA EL NUEVO USUARIO EN TERMINOS DEL BLOCKCHAIN
            let se = await PropertyPageContainer.encode(p).finish()
            updates[address] = se
            //SE CREA EL NUEVO USUARIO EN EL BLOCKCHAIN
            await context.setState(updates)


        }
    }
    if (t) {
        //ENTRA SI NO EXISTE UN CONTENEDOR DE USUARIOS EN EL BLOCKCHAIN


        let newcontainer = PropertyPageContainer.create({
            entries: [],
        })


        newcontainer.entries.push(page)

        let updates = {}
        //SE CODIFICA EL NUEVO USUARIO EN TERMINOS DEL BLOCKCHAIN
        let se = await PropertyPageContainer.encode(newcontainer).finish()
        updates[address] = se
        //SE CREA EL NUEVO USUARIO EN EL BLOCKCHAIN
        await context.setState(updates)
    }
}

async function make_new_reported_value(reporter_index, timestamp, prop) {

    let reported_value = PropertyPage.ReportedValue.create({
        reporter_index: reporter_index,
        timestamp: timestamp,
    })


    var DATA_TYPE_TO_ATTRIBUTE = {}

    DATA_TYPE_TO_ATTRIBUTE[PropertySchema.BYTES] = 'bytes_value'
    DATA_TYPE_TO_ATTRIBUTE[PropertySchema.STRING] = 'string_value'
    DATA_TYPE_TO_ATTRIBUTE[PropertySchema.INT] = 'int_value'
    DATA_TYPE_TO_ATTRIBUTE[PropertySchema.FLOAT] = 'float_value'


    switch (prop.data_type) {
        case PropertySchema.BYTES:
            reported_value.bytes_value = prop.bytes_value;
            break;
        case PropertySchema.BOOLEAN:

            reported_value.boolean_value = prop.boolean_value;

            break;
        case PropertySchema.NUMBER:

            reported_value.boolean_value = prop.number_value;

            break;
        case PropertySchema.STRING:

            reported_value.boolean_value = prop.string_value;

            break;
        case PropertySchema.ENUM:
            reported_value.bytes_value = prop.enum_value;
            break;


        default:
            let text = "I have never heard of that fruit...";
    }


    return reported_value


}


async function getContainer(context, address, entity) {

    let container = null
    switch (entity) {
        case "AGENT":
            container = AgentContainer;
            break;
        case "PROPERTY":
            if (address.substr(-4) === "0000") {
                container = PropertyContainer;
            } else {
                container = PropertyPageContainer;
            }

            break;
        case "PROPOSAL":
            container = ProposalContainer;
            break;
        case "RECORD":
            container = RecordContainer;
            break;
        case "RECORD_TYPE":
            container = RecordTypeContainer;
            break;

        default:
            let text = "I have never heard of that fruit...";
    }

    const entries = await context.getState([address])


    console.log(entries)

    if (entries) {
        console.log("entries")

        let newcontainer = await container.decode(entries[address])

        return newcontainer

    }


    return container


}

async function setContainer(context, address, container, entity) {


    const updates = {}
    let entityContainer = null

    switch (entity) {
        case "AGENT":
            entityContainer = Agent;
            break;
        case "PROPERTY":
            entityContainer = Property;
            break;
        case "PROPOSAL":
            entityContainer = Proposal;
            break;
        case "RECORD":
            entityContainer = Record;
            break;
        case "RECORD_TYPE":
            entityContainer = RecordType;
            break;

        default:
            let text = "I have never heard of that fruit...";
    }

    // Record field.
    updates[address] = entityContainer.encode(container).finish()

    await context.setState(updates)


}


module.exports = ChequesHandler
